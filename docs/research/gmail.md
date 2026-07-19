# レポート: gmail

# Gmail API 送信の技術要件調査レポート

対象: Next.js(Node.js)製の社内営業ツールから Gmail API 経由でメール送信する構成。1日50〜200通・送信担当2〜3名を想定。

---

## (1) OAuth: スコープと審査要件

### スコープの権限範囲比較（公式: [Choose Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)）

| スコープ | 分類 | 権限範囲 |
|---|---|---|
| `gmail.send` | **Sensitive**（Restrictedより軽い） | 送信のみ。既存メールの読み取り・変更は不可 |
| `gmail.compose` | **Restricted** | 下書きの作成・管理＋送信 |
| `gmail.modify` | **Restricted** | 読み取り・作成・送信・ラベル操作（完全削除は不可） |
| `gmail.metadata`（参考） | **Restricted** | ヘッダー・ラベルのみ閲覧可、本文不可 |

本ツールの要件（送信＋返信検知＋バウンス検知）は**受信トレイの読み取りも必要**なため、送信専用の`gmail.send`だけでは足りず、`gmail.modify`（または`gmail.readonly`）のような**Restrictedスコープが実質必須**になる点に注意。

### Restricted scope の審査

- Restrictedスコープを使うアプリは、原則としてOAuthアプリ検証（ブランド確認＋Restricted scope verification）が必要。データをサーバーに保存/転送する場合は独立第三者機関によるセキュリティアセスメント（CASA等）が必要で、審査完了まで数週間かかりうる。承認後も**年次の再アセスメント**が必要。（[Restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)）

### 社内利用の場合の選択肢

**選択肢A: Google Workspace の「Internal」アプリタイプ**
- 前提条件: GCPプロジェクトが**Google Workspace（有料）または Cloud Identity 組織に所属**している必要があり、無料Gmailアカウントでは「Internal」タイプ自体が選べない。（[Configure OAuth consent](https://developers.google.com/workspace/guides/configure-oauth-consent), コミュニティ報告で複数確認）
- 効果: 100ユーザー上限・7日間リフレッシュトークン失効・「unverified app」警告画面・ブランド確認が**免除**される。（[When is verification not needed](https://support.google.com/cloud/answer/13464323?hl=en)）
- **注意（公式ドキュメント間で表現に揺れあり・要確認事項として明記）**: Google Workspace管理者向けページでは「組織内部利用のみのアプリはRestricted/Sensitiveスコープ使用でもGoogleによる追加審査は不要」と記載される一方、OAuth審査の公式ページでは「ドメイン全体インストールでもRestricted/Sensitiveスコープを使うなら審査は必要（ブランド確認のみ免除）」とも書かれており、**一次情報同士で整合性が取り切れていない**（[restricted-scope-verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)）。実務上は「Internal」設定時にGoogle Cloud Consoleが提示する実際の警告・審査要求表示に従うのが確実。

💬 ざっくり: 会社がすでにGoogle Workspace（有料のGmail）を使っているなら、「社内限定アプリ」に設定することで、面倒な審査プロセスの大部分（100人上限・毎週ログインし直す不具合・警告画面）を回避できます。ただし「返信も読む」機能を足すと、Google公式ドキュメント自体が矛盾した書き方をしていて、100%審査不要とは言い切れません。

**選択肢B: 無料Gmailアカウント + テストモード運用**
- 「Testing」公開ステータスでは**テストユーザー上限100人**まで。（[Manage App Audience](https://support.google.com/cloud/answer/15549945?hl=en)）
- テストモードで発行されたリフレッシュトークンは**同意から7日で失効**する（ユーザー情報スコープのみのケースを除く）。7日ごとに再同意が必要になり、業務ツールとしては継続運用に耐えない。（[OAuth2 doc](https://developers.google.com/identity/protocols/oauth2), [production-readiness overview](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)）
- 本番相当で継続運用するには結局「External」＋本番公開＋Restricted scope審査が必要になる。

💬 ざっくり: 無料Gmailでお試し運用する場合、7日ごとに再ログインが必要になり実用的ではありません。継続利用するには結局Googleの正式審査を通す必要があります。

**結論**: 会社がGoogle Workspace契約済みなら「Internal」一択（審査負担が最小）。無料Gmailのみの場合は本番運用に耐えず、Workspace契約を推奨。

---

## (2) 送信上限

### メール送信数の上限（公式）

| 種別 | 1日の送信上限 | 1通あたりの宛先上限 | 出典 |
|---|---|---|---|
| 無料Gmail（個人） | **500通/日** | 500人 | [Gmail Help](https://support.google.com/mail/answer/22839?hl=en) |
| Google Workspace（有料） | **2,000通/日** | 2,000人（外部宛は最大500人まで） | [Gmail sending limits in Workspace](https://knowledge.workspace.google.com/admin/gmail/gmail-sending-limits-in-google-workspace?hl=en) |
| Google Workspace（トライアル） | 500通/日 | — | 同上 |
| メールマージ機能利用時 | 1,500通/日（Workspace） | — | 同上 |

上限判定は**固定の日付境界ではなくローリング24時間**で計算される。エイリアス・委任(delegate)からの送信も**同一アカウントの上限に合算**される。（同上）

### Gmail API クォータ（公式: [Usage limits](https://developers.google.com/workspace/gmail/api/reference/quota)）

- プロジェクト全体で **1日80,000,000クォータユニット**
- `messages.send` は **1リクエスト100ユニット**
- レート制限: プロジェクト全体で1分1,200,000ユニット、**ユーザー1人あたり1分6,000ユニット**（=理論上60通/分/ユーザー相当）
- 秒単位の明示的なレート制限は公式ページに記載なし（未確認）

### 1日50〜200通の場合どちらが必要か

- API側のクォータ（8000万ユニット/日）は50〜200通（5,000〜20,000ユニット）では全く問題にならない。**律速するのは送信数上限（500 or 2,000）ではなく、Google側の迷惑メール判定・レピュテーション**である。
- 無料Gmailの500通/日枠でも**数値上は**200通は収まるが、(3)(4)で述べる送信者要件・凍結リスクの観点から、**社内営業ツールとしてはGoogle Workspace（有料）を強く推奨**。理由: SPF/DKIM/DMARC等のドメイン認証は組織所有ドメイン前提で設計しやすい、Postmaster Toolsでの評判管理がしやすい、Internal OAuthアプリが使える、複数担当者の管理（委任・監査ログ）が可能、無料アカウントの「個人利用規約」との整合性リスクを避けられる。

💬 ざっくり: API自体の上限は50〜200通なら全く問題になりません。ボトルネックは「Googleにスパムと疑われないか」という信頼度の問題です。無料Gmailの上限（500通）でも数字上は足りますが、営業目的の組織利用としては有料のGoogle Workspaceを使う方が安全です。

---

## (3) 2024年2月施行 Google メール送信者ガイドライン

公式: [Email sender guidelines](https://support.google.com/mail/answer/81126?hl=en) / [FAQ](https://support.google.com/a/answer/14229414?hl=en)

### 5,000通/日閾値の内容

Gmailアカウント宛に**1日5,000通を超えて**送信する送信者を「高送信量(high-volume)送信者」と定義し、追加要件を課す。

### 全送信者（閾値未満も含む）に必須の要件

- **SPF または DKIM**（どちらか一方でOK。DMARCは閾値未満なら必須ではない）
- 有効な順引き・逆引きDNSレコード（PTRレコード）
- TLS接続での送信
- RFC 5322準拠のメッセージ形式
- Gmailの`From:`ヘッダーを詐称しない
- Postmaster Toolsでの**迷惑メール報告率0.3%未満**の維持

### 5,000通/日を超える送信者のみ追加で必要

- **DMARC**の設定（enforcementポリシーは`p=none`でも可）
- `From:`ドメインがSPFまたはDKIMドメインとDMARCアライメントすること
- **ワンクリック登録解除**（マーケティング/購読メールに限る）

### B2B 1対1型メールへの適用可否

- ワンクリック解除の義務は**「marketing messages and subscribed messages（マーケティング・購読型メッセージ）」に限定**され、トランザクションメール（パスワードリセット等）は対象外と明記されている。
- ただし「プロモーション/トランザクションの境界はGoogleではなく受信者の受け止め方で決まる」ともFAQに明記されており、**コールドセールスメールがどちらに分類されるかは公式に明確な線引きがない**（未確認・グレーゾーン）。
- 50〜200通/日は5,000通の閾値を大きく下回るため、**DMARC必須化・ワンクリック解除必須化は法的/技術的には非該当**。ただし SPF/DKIM・0.3%未満のスパム率・RFC5322準拠は**通数に関わらず全送信者に適用**される。

💬 ざっくり: 「1日5,000通」ルールは御社の想定通数（50〜200通）には直接該当しません。ただし「送信ドメインの認証(SPF/DKIM)をする」「迷惑メール報告率を0.3%未満に抑える」は通数に関係なく全員に課される最低ラインです。ワンクリック解除も、法律上は必須ではありませんが、Gmail側のスパムフィルタは通数に関わらず内部的にこれらのシグナルを参照している可能性が高く、実装しておくのが無難です。

---

## (4) 凍結回避の実務

**注記**: このセクションはGoogleの内部スパム判定アルゴリズムの詳細を含み、Google公式は具体的な閾値や判定ロジックを公開していない。以下は業界の二次情報（複数のコールドメール/デリバラビリティ専業ベンダーのブログ）に基づく実務知見であり、**一次情報での裏付けが取れない部分は「未確認」として明記する**。

### ウォームアップ（未確認: 業界コンセンサスであり公式ガイダンスなし）
- 新規アカウント/新規ドメインは低ボリュームから開始し数週間かけて段階的に増量、が業界標準とされる。（例: [smartlead](https://www.smartlead.ai/blog/gmail-sending-limits), [mailreach](https://www.mailreach.co/blog/google-workspace-email-sending-limits)）
- **重要な公式グラウンディング**: Googleは2023年2月、Gmail APIを使った**サードパーティ製ウォームアップツール（自動的な疑似エンゲージメント生成）を明示的に禁止**し、該当機能を提供していたベンダー（GMass等）はAPIアクセス取消を警告され機能を停止した。Google側の説明として「複数アカウントを使ってGoogleのポリシーを回避する行為はGmail APIスコープへのアクセスを禁止する」という通知文が報告されている（二次情報経由の引用、Google公式ページでの一次確認はできず・未確認）。（[isipp報告](https://www.isipp.com/blog/google-gives-gmail-mass-email-services-the-boot/)）
- 一方、Gmail Program Policiesの公式条項には**「以前禁止されていた行為を行うために複数アカウントを作成・使用すること」を明確に禁止する「Circumvention」条項**がある（一次情報で確認済み）。（[Gmail Program Policies](https://support.google.com/mail/answer/16734397?hl=en)）

### 送信間隔のランダム化（未確認: 業界プラクティス）
- 一定間隔での機械的な連続送信は「アカウント乗っ取り」パターンと類似したシグナルになりうるとされ、送信間隔・時間帯の分散が推奨される、という二次情報が複数ある。公式な閾値の記載なし。

### 典型的な凍結原因（未確認: 業界報告の集約、公式の因果関係公開なし）
- 急激な送信量の増加（普段静かなアカウントが突然大量送信）
- 高いバウンス率（不正確なリストなど）
- 受信者からの迷惑メール報告の多さ
- SPF/DKIM/DMARC等の認証未設定
- 複数アカウントを使った送信上限の意図的な回避（→ 公式Circumvention条項に抵触しうる、これは一次情報で確認済み）

💬 ざっくり: 「アカウントがどう凍結されるか」の具体的なアルゴリズムはGoogleが公開していないため、ここは業界のノウハウの寄せ集めです。ただし1点だけ公式ルールとして明確なのは「上限を回避する目的で複数アカウントを使い分けるのは規約違反」ということ。営業担当者ごとに実在するアカウントを持たせるのはOKですが、「1人が上限を超えたくて複数アカウントを機械的に使い回す」のは規約違反になり得ます。

---

## (5) 実装

### googleapis npm での送信実装

公式ガイド（[Create and send email messages](https://developers.google.com/workspace/gmail/api/guides/sending)）の要点:

1. RFC 2822準拠のMIMEメッセージを作成
2. **base64url**エンコード（`+`→`-`、`/`→`_`、末尾`=`除去）してから`raw`フィールドにセット
3. `gmail.users.messages.send({ userId: 'me', requestBody: { raw } })` で送信
4. 下書きは `gmail.users.drafts.create({ userId: 'me', requestBody: { message: { raw, threadId } } })`。スコープは`gmail.modify`または`gmail.compose`が必要。（[users.drafts.create リファレンス](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.drafts/create)）

公式ドキュメントにNode.js専用サンプルは掲載されておらず（Python/Java例のみ）、Node.jsでの実務上の定番は**Nodemailerの`MailComposer`でRFC822メッセージを組み立ててからbase64url変換しGmail APIに渡す**方式。

### 日本語件名のMIMEエンコード / From表示名

- 件名など非ASCII文字を含むヘッダーは**RFC 2047のencoded-word形式**（`=?UTF-8?B?<base64>?=`）でエンコードする必要がある。1つのencoded-wordは75文字以内、超える場合は複数に分割して折り返す。（[RFC 2047](https://www.rfc-editor.org/rfc/rfc2047)）
- Nodemailerの`MailComposer`は**日本語などの非ASCII文字を含む件名・表示名を自動的にRFC2047/MIME wordエンコードする**ため、通常は手動エンコード不要。（[Nodemailer Mailcomposer](https://nodemailer.com/extras/mailcomposer)）
- Fromの表示名（例:「株式会社Cypherone 山田太郎 <yamada@example.com>」）も同様に日本語部分のみエンコードされ、`<...>`のアドレス部はそのまま保持される。

### リフレッシュトークンの保存と失効ハンドリング

- 本番・検証済みアプリでは、リフレッシュトークンは**明示的な失効操作がない限り基本的に無期限**。ただし以下の条件で失効する（公式: [Using OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)）:
  - ユーザーによるアクセス取り消し
  - **6ヶ月間未使用**での自動失効
  - Gmailスコープ利用時のパスワード変更
  - **1ユーザー×1クライアントあたり最大50個**のリフレッシュトークン上限超過（超過すると古いトークンから無効化）
  - Testing公開ステータス時の**7日失効**（(1)参照）
- 実装上の定石: `googleapis`ライブラリの`oAuth2Client`は`tokens`イベントでトークン更新を通知するので、これをDBに永続化する。リフレッシュ失敗時に`invalid_grant`が返る場合は**再試行せず**、対象アカウントを「要再認証」状態にマークしてユーザーに再ログインを促す（githubのissueレポートでも「invalid_grantは恒久的失敗として扱うべき」との実務知見あり、[googleapis issue #2494](https://github.com/googleapis/google-api-nodejs-client/issues/2494)）。
- トークンは暗号化して保存するのが妥当（コーディング規範上の一般原則。Google公式の保存方式指定はなし＝未確認）。

💬 ざっくり: 日本語の件名や名前は、送信ライブラリ（Nodemailer）にお任せすれば自動的に正しい形式に変換してくれるので、自前でエンコード処理を書く必要はありません。ログイン情報（リフレッシュトークン）は基本的にはずっと有効ですが、「半年ログインなし」「本人が連携解除」「パスワード変更」などで急に無効になることがあるため、無効になった時に自動でエラーにせず「再ログインしてください」と案内する仕組みが必要です。

---

## (6) 返信検知・バウンス検知

### 返信検知（threadId / In-Reply-To）

公式（[Manage threads](https://developers.google.com/workspace/gmail/api/guides/threads)）:
- Gmailは`threads`リソースで会話をグループ化。送信時のメッセージ/下書きをスレッドに紐付けるには以下**3条件すべて**が必要:
  1. リクエストに`threadId`を指定
  2. `References`・`In-Reply-To`ヘッダーをRFC 2822準拠で設定
  3. `Subject`ヘッダーが一致
- 実装イメージ: 初回送信時に返ってきた`messages.send`のレスポンスから`threadId`と`Message-ID`を保存 → 受信箱をポーリング（`threads.get`または`messages.list`＋`q: "in:inbox"`等）して、保存済み`threadId`に新着メッセージがあれば「返信あり」と判定。

### バウンス検知（mailer-daemon）

公式のGmail API専用エンドポイントは存在しないため、**通常の受信メール検索として実装**する（二次情報だが技術的に妥当な標準手法）:
- `gmail.users.messages.list({ q: 'from:mailer-daemon' })` 等でバウンス通知メールを検索
- バウンス通知本体（DSN形式）から`X-Failed-Recipients`ヘッダー（宛先アドレス）、`Action`/`Status`/`Diagnostic-Code`フィールド（SMTPエラーコード。550=アドレス不存在、554=スパム判定等）をパースして原因を特定
- ヘッダーのみで宛先特定は可能（`gmail.metadata`スコープでも可）だが、`Diagnostic-Code`等の詳細診断はメッセージ本文/MIMEパート内にあるため、**本文アクセスが必要（`gmail.readonly`または`gmail.modify`が必要、`gmail.metadata`だけでは不足）**（自己推論・未確認: 公式ドキュメントにDSNパース手順の明記なし）。

💬 ざっくり: 「返信が来たか」はGmailが自動でメールをまとめる「スレッド」機能に相乗りすれば判定できます。「送信失敗（宛先間違い等）」はGoogleの自動返信メール（差出人がmailer-daemon）を受信トレイから検索して中身を解析する形になります。ただし失敗理由の詳細まで読み取るには、単なるヘッダー閲覧権限では足りず、本文まで読める権限が必要です。

---

## (7) 複数送信者対応の比較

**選択肢A: 担当者ごとに個別Googleアカウント＋個別OAuth連携**

- 各担当者が自分のGoogle/Workspaceアカウントで個別にOAuth同意する。送信は各自の実アカウント名義（表示名・返信先とも本人）。
- 送信上限は**担当者ごとに独立**（Workspaceなら1人2,000通/日）。
- OAuth同意フローが担当者数分必要（Internal設定でも各自ログインは必要）。
- **公式ポリシー適合性が高い**: 各アカウントは実在する担当者が正当に使う独立したメールボックスであり、Gmail Program Policiesの「複数アカウントで制限回避」条項には該当しない。（[Gmail Program Policies](https://support.google.com/mail/answer/16734397?hl=en)）

💬 ざっくり: 営業担当者それぞれが自分名義のGoogleアカウントでログインして送る方式です。「本人のメールとして届く」ので受信者から見て自然で、Googleの規約上も一番安全です。ただし担当者が増えるたびにログイン設定の手間が増えます。

**選択肢B: 1アカウント＋send-asエイリアス方式**

- 公式（[users.settings.sendAs.create](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.settings.sendAs/create)）: 自分以外のアドレスをsend-asエイリアスとして追加する場合、**所有権確認メールへの返信が必要**（または、Workspace管理者がドメイン全体委任(domain-wide delegation)で自動検証済みにする方法もあるが、これはWorkspace管理者権限とサービスアカウントが前提）。
- **重要な制約（公式で確認済み）**: send-asエイリアスは**認証元アカウントの送信上限を共有する**。「エイリアスと本アカウントは別枠」ではなく、合算で1日2,000通（Workspace）/500通（無料）の枠を食い合う。つまりB方式では**担当者を増やしても合計の送信可能数は増えない**。
- Fromの表示名だけは担当者ごとに変えられるが、実際に送信しているのは常に同一の裏側アカウントであり、SPF/DKIMのアライメントも複雑になりやすい。

💬 ざっくり: 1つのGoogleアカウントの中に「見た目の差出人」を複数用意する方式です。設定は選択肢Aよりシンプルですが、致命的な弱点があります——エイリアスを何人分作っても、1日に送れる合計通数は増えません（全員で1つの上限を分け合う形になります）。2〜3名で50〜200通なら上限的には問題になりませんが、将来担当者や通数が増えたときにボトルネックになります。

**選択肢C（追加提案）: Google Workspaceのドメイン全体委任（service account + domain-wide delegation）**

- 公式（[Perform domain-wide delegation](https://developers.google.com/workspace/cloud-search/docs/guides/delegation)）: Workspace管理者がサービスアカウントに委任権限を付与すれば、**担当者個別のOAuth同意なしに**サーバー側から各担当者本人のメールボックスとしてAPIを呼び出せる（`with_subject()`で対象ユーザーを指定）。
- Workspace限定機能（無料Gmailでは不可）。各担当者は実アカウントとして送信するため送信上限も担当者ごとに独立し、選択肢Aの上限メリットを保ちながら、担当者ごとの個別ログイン運用の手間を管理者側に集約できる。
- 設定は管理コンソールでの委任設定が必要でやや高度、キー管理（サービスアカウント秘密鍵）のセキュリティ要件が上がる。（[Domain-Wide Delegation Abuses](https://medium.com/@lutzenfried/gcp-domain-wide-delegation-abuses-b82b8dd8cf15)、参考記事のためリスク面は複数一致するが一次情報での網羅確認はできず一部未確認）

💬 ざっくり: 会社の管理者が一度だけ許可を出せば、あとはサーバー側のプログラムが各担当者本人になりすまして（本人の同意ボタンを都度押させることなく）送信できる、上級者向けの方式です。選択肢Aの「上限が人数分増える」メリットを保ちながら、個別ログインの手間を省けますが、設定難度とセキュリティ管理の負担が上がります。

---

## 推奨アーキテクチャ（1日50〜200通・送信者2〜3名）

**前提**: 会社としてGoogle Workspace契約があること（無いなら契約を推奨。理由は(2)(3)参照）。

1. **OAuthアプリタイプ**: Internal（Workspace組織限定）に設定し、100ユーザー上限・7日失効・unverified警告を回避。restricted scopeの実審査要否はGCPコンソール上の実際の表示に従って都度確認する。
2. **スコープ**: `gmail.modify`（送信＋返信/バウンス検知の受信箱読み取りを1スコープでカバー）。`gmail.send`と`gmail.readonly`を分けて要求する設計も可だが、実運用上は`gmail.modify`1本で足りる。
3. **送信者アカウント方式**: 選択肢A（担当者2〜3名それぞれの実Workspaceアカウントで個別OAuth連携）を基本線とする。人数が少ない（2〜3名）段階では選択肢Cのドメイン全体委任の運用コストに見合わないため、まずはA、担当者が10名規模に増える見込みが出た時点でCへの移行を検討。
4. **送信実装**: `googleapis`の`gmail.users.messages.send`＋Nodemailerの`MailComposer`でRFC822メッセージ生成（日本語件名・表示名は自動MIMEエンコードされるため手動処理不要）。返信送信時は保存済み`threadId`・`Message-ID`から`References`/`In-Reply-To`を組み立て、`Subject`を"Re: "付きで一致させる。
5. **トークン管理**: 担当者ごとのrefresh tokenをDBに暗号化保存し、`tokens`イベントで更新を永続化。`invalid_grant`検知時は即座に「要再認証」状態にして再ログイン導線を出す（自動リトライしない）。
6. **返信/バウンス検知**: 定期ポーリング（例: Cronで数分〜十数分おき）で`threads.get`により送信済みthreadIdの新着を確認、`from:mailer-daemon`検索でバウンスを検知しヘッダー・DSN本文をパース。
7. **配信到達性**: 送信ドメインにSPF・DKIM（Workspace管理コンソールで設定）を必須実装。5,000通/日未満でDMARC・ワンクリック解除は法的必須ではないが、Postmaster Toolsでのスパム報告率0.3%未満維持のため、DMARC（`p=none`）も合わせて設定しておくことを推奨（コスト低・下振れリスク回避）。
8. **凍結回避運用**: 新規に有効化するWorkspaceアカウントは低ボリュームから段階的に増量する（未確認だが業界標準の安全策）。1日の送信を担当者間・時間帯にわたって自然に分散させ、機械的な一定間隔連続送信を避ける。複数アカウントを「1人あたりの上限を回避する目的」で使い回さない（Gmail Program Policiesの明文規定に抵触するリスク）。

💬 ざっくり: まとめると「会社のGoogle Workspaceを使う」「社内限定アプリとして登録する」「営業担当者ごとに本人名義のアカウントでログインしてもらう」「送信と受信箱チェックを1つの権限にまとめる」「日本語の文字化け対策はライブラリに任せる」「ログイン切れは自動で直そうとせず本人に知らせる」「ドメイン認証(SPF/DKIM/DMARC)は通数に関係なく最初から入れておく」という7点セットが、今回の規模（50〜200通・2〜3人）に対して手間とリスクのバランスが良い構成です。

---

### 未確認・要フォローアップ事項一覧
- Internal Workspace アプリでRestricted scope使用時に実際に審査要求が出るか否か → 公式ドキュメント間で表現が食い違うため、GCPコンソールでの実設定時に要確認
- Gmail APIのper-second単位のレート制限値 → 公式クォータページに記載なし（分単位のみ公開）
- コールドメールでの典型的なアカウント凍結原因の具体的閾値 → Google非公開のため業界二次情報のみ
- 2023年2月のGmail API向けウォームアップツール禁止の正式な公式アナウンスページ → 一次情報での直接確認はできず、業界メディア経由の引用のみ
- バウンス通知(DSN)パースに必要な最小スコープ（metadataで足りるか本文アクセス必須か）→ 自己推論であり公式記載なし

---

# 独立検証結果

# Gmail API送信要件レポート 再検証結果

対象レポートの意思決定に最も影響する主張を5つ選定し、レポートの引用URLに頼らず独立にWeb検索・一次情報照合を行った。

---

## [主張1] Internal（社内限定）OAuthアプリでRestricted/Sensitiveスコープを使う場合、「Google Workspace管理者向けページ」と「OAuth審査の公式ページ」の間で審査要否の記述が矛盾しており、一次情報同士で整合性が取り切れていない

**[判定] 誤り**

**[根拠URL]**
- https://developers.google.com/workspace/guides/configure-oauth-consent
- https://support.google.com/cloud/answer/13464323?hl=en
- https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification

**[修正文]**
3つの一次情報を突き合わせると矛盾ではなく、**「Internal（社内限定）ユーザータイプ」と「domain-wide installation（ドメイン全体インストール）」という別々の2つの仕組みを混同していた**ことが原因と判明した。
- `configure-oauth-consent`: 「For apps used only internally by your Google Workspace organization, scopes aren't listed on the consent screen and use of restricted or sensitive scopes doesn't require further review by Google.」＝OAuth同意画面のユーザータイプを「Internal」に設定した組織限定アプリは、Restricted/Sensitiveスコープでも**追加審査（CASA等のセキュリティアセスメント含む）は不要**。
- `cloud/answer/13464323`（"When is verification not needed"）でも「Internal Use Apps」は審査不要の独立した例外カテゴリとして明記されており、Restricted scopeでの留保は付いていない。
- `restricted-scope-verification`ページ自身も「Internal use only」と「Domain-wide installation」を**別項目**として例外列挙しており、審査（スコープ検証）が必要になるのは後者（Marketplace等でドメイン管理者が第三者/社内アプリにドメイン全体でアクセス権を与える別の仕組み）の場合のみで、「won't require **brand** verification」（ブランド確認は免除、スコープ審査は別途必要）という限定付き。「Internal use only」にはこの限定は付いていない。

つまり、本レポートが推奨する構成（自社Workspace所有GCPプロジェクト＋OAuth同意画面をInternalに設定し担当者個人がログイン）は「Internal use only」の経路に該当し、**Restricted scopeの審査（CASA含む）は原則不要**と一次情報間で一致している。「一次情報同士で整合性が取り切れていない」という記述は誤りで、正しくは「Internal（社内限定）とドメイン全体インストールは別の仕組みであり、前者を選ぶ限り審査は不要」。ただし実際の挙動はGCPコンソールの表示で最終確認するという実務上の注意書き自体は妥当。

💬 ざっくり: 「審査が必要かどうかGoogleの説明が矛盾していて確定できない」という部分は誤りでした。正しくは「社内限定（Internal）」という設定を選ぶ限り、面倒な審査（本人確認や第三者機関のセキュリティ検査）は原則不要、とGoogleの公式説明は一致しています。矛盾に見えたのは、"社内限定アプリ"と"会社の管理者が外部アプリを全社員に一括インストールする別の仕組み"を混同していたためです。今回作ろうとしている営業ツールは前者（社内限定）なので、審査不要という結論で問題ありません。

---

## [主張2] 送信数上限は無料Gmail（個人）500通/日・500人、Google Workspace（有料）2,000通/日・1通あたり2,000人（外部宛は最大500人まで）

**[判定] 確認済み**

**[根拠URL]**
- https://knowledge.workspace.google.com/admin/gmail/gmail-sending-limits-in-google-workspace?hl=en
- https://support.google.com/mail/answer/22839?hl=en

一次情報を直接確認したところ、Workspace通常アカウントの日次送信上限は2,000通（トライアルは500通）、1メッセージあたり合計2,000宛先（外部宛は最大500人まで）で報告書の数値と一致。無料Gmailは「1日に500通超」「1通に500人超」で制限がかかる旨が公式ヘルプに明記されており、これも一致。なお公式ページには報告書に無い追加の細目（1日の総ユニーク受信者数3,000人／うち外部2,000人など）も存在するが、報告書の主張と矛盾しない。

💬 ざっくり: 「無料は500通、有料Workspaceは2,000通」という数字は公式サポートページで裏取りできました。誤りはありません。

---

## [主張3] Gmail APIクォータは`messages.send`が1リクエスト100ユニット、プロジェクト全体で1日80,000,000ユニット、ユーザー1人あたり1分6,000ユニット

**[判定] 確認済み**（ただし2026年後半に課金体系変更予定という追加情報あり）

**[根拠URL]** https://developers.google.com/workspace/gmail/api/reference/quota

公式クォータページを直接取得し、「Method: messages.send, Quota units: 100」「Per day per project: 80,000,000 quota units」「Per minute per user per project: 6,000 quota units」を確認。報告書の数値・結論（50〜200通/日なら全く問題にならない）は正しい。

**追加で判明した新情報（報告書には未記載）**: 同ページに「Exceeding the quota request limits is planned to incur charges to your Google Cloud billing account later in 2026」「Full billing details will be shared later in 2026 with at least 90 days' notice」との記載があり、**現状は無料だが2026年後半にクォータ超過分への課金導入が予定されている**（詳細未公表、90日前告知）。今回の50〜200通/日（5,000〜20,000ユニット/日）は8,000万ユニットの上限に対して極小のため影響は無いと見られるが、将来の料金体系変更として注記推奨。

💬 ざっくり: API自体の余裕（1日8,000万ユニット）についての数字は正確でした。加えて、Googleは2026年後半からクォータ超過分に課金を始める予定であることも公式ページで分かりました。今回の想定通数（50〜200通）なら課金対象になる可能性はほぼゼロですが、念のため「将来的に課金体系が変わる可能性がある」と覚えておくとよいです。

---

## [主張4] 2024年2月1日施行のGoogle送信者ガイドラインで、1日5,000通超が「高送信量送信者」の閾値。全送信者にSPFまたはDKIM・有効な順引き逆引きDNS(PTR)・TLS・RFC5322準拠・迷惑メール報告率0.3%未満などが必須で、DMARC・ワンクリック登録解除は5,000通超の送信者のみ追加必須

**[判定] 確認済み**

**[根拠URL]** https://support.google.com/mail/answer/81126?hl=en

公式ページを直接取得し確認：「Starting February 1, 2024, email senders who send more than 5,000 messages per day to Gmail accounts must meet the requirements in this section」。全送信者向け要件として「Set up SPF or DKIM」「valid forward and reverse DNS (PTR) records」「TLS connection」「RFC 5322」「spam rates...below 0.3%」「Don't impersonate Gmail From: headers」を確認。5,000通超のみの追加要件として「Set up DMARC...enforcement policy can be set to none」「Marketing messages and subscribed messages must support one-click unsubscribe」を確認。報告書の記述と完全に一致。

💬 ざっくり: 「5,000通ルールは1対1のB2Bメールが多い今回の規模には直接は該当しない」「でもSPF/DKIMと迷惑メール報告率0.3%未満は通数に関係なく全員必須」という報告書の説明は、公式ページの原文と一致しており正確でした。

---

## [主張5] send-asエイリアスは認証元（本体）アカウントの送信上限を共有し、エイリアスを何人分作っても合計の送信可能数は増えない

**[判定] 確認済み**

**[根拠URL]** https://knowledge.workspace.google.com/admin/gmail/gmail-sending-limits-in-google-workspace?hl=en

公式ページに「Messages sent from a user's alternate address, or alias」「Messages sent by delegated users」が日次送信上限にそのまま合算される旨が明記されている。エイリアス経由の送信が本体アカウントとは別枠になるという記述は存在せず、報告書の「エイリアスと本アカウントは別枠ではなく合算で上限を食い合う」という主張と一致する。これは選択肢A（担当者ごとに個別アカウント）を推奨する根拠として妥当。

💬 ざっくり: 「エイリアスを増やしても送信できる合計通数は増えない」という、選択肢の優劣を左右する重要な主張は公式ページで裏取りでき、正しいことが確認できました。

---

## 総括

5件中4件は一次情報で裏取りでき「確認済み」。1件（Internal OAuthアプリのRestricted scope審査要否）は、報告書が「一次情報同士に矛盾があり未解決」としていた点について、独立に3つの一次情報を突き合わせた結果、**矛盾ではなく「Internal（社内限定）」と「domain-wide installation」という別概念の混同**であることが判明し、実際には「社内限定に設定すれば審査不要」という一次情報同士の一致した結論が得られたため「誤り」と判定した。この修正により、報告書冒頭の「実務上はGCPコンソールの表示に都度従う」という慎重な留保は不要になり、Internal設定であれば審査負担を確度高く見込めるという、意思決定上むしろ有利な修正となる。また主張3の検証過程で、報告書には無い新情報（Gmail APIクォータ超過への課金が2026年後半に導入予定）を発見したため参考情報として付記した。