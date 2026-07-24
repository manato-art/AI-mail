# AI-mail UI/IA/UX 大改修マップ（機能を落とさないための対応表）

> **目的**: 各画面が「どのAPIを叩き・どんなクライアント側ロジックを持ち・どこを誤ると機能が退行するか」を1枚に。
> UI/IAを作り替える際、この表の『APIの契約』と『⚠️安全/要注意』を保てば、動いている機能は壊れない。
> 生成元: 15ページ並列マップ（読むだけの静的解析, 2026-07-24）。

## 大前提（壊さないための鉄則）

1. **エンジン（`lib/` 8,030行 ＋ `app/api/**` 49エンドポイント）は触らない**。触るのは `app/**/page.tsx` と `components/` のみ。→ `verify-*.mts` 30本(約261ケース)＋tsc＋buildが緑のまま＝機能不変の客観ゲート。
2. **APIの契約（endpoint / method / body）を1文字も変えない**。新UIも同じ49本を同じ形で叩く。
3. **各ページの⚠️安全/要注意ロジックを忠実に移植**。特に送信系（acknowledgedWarnings, 送信済/予約済の除外, 各宛先最新1件のdedup, force/forceLowフラグ）。
4. **段階移行**: 一気にでなくページ単位。`bulk-send`(最大)は最後に・最厚くテスト。旧ページは新ページ検証まで残す。
5. **検証**: 別ブランチ→Railway preview→`TEST_MODE_RECIPIENT`で実送信ゼロにして全フローを通す。

## 改修リスク順（大きい＝クライアントロジック多＝要注意）

| 画面 | 行数 | API数 | ⚠️要注意点 |
|---|--:|--:|--:|
| `/bulk-send` | 2613 | 14 | 11 |
| `/generate` | 1330 | 6 | 9 |
| `/collection/search` | 809 | 7 | 8 |
| `/prospect/[id]` | 745 | 10 | 9 |
| `/settings` | 737 | 10 | 9 |
| `/collection` | 665 | 9 | 10 |
| `/settings/services` | 618 | 6 | 6 |
| `/collection/companies` | 615 | 6 | 6 |
| `/` | 595 | 4 | 6 |
| `/settings/templates` | 580 | 8 | 6 |
| `/settings/personas` | 551 | 4 | 5 |
| `/history` | 515 | 7 | 7 |
| `/settings/suppressions` | 332 | 3 | 6 |
| `/login` | 96 | 1 | 4 |
| `NAV/IA shell (app root + /collection/* + /settings/*)` | — | 0 | 4 |

## APIエンドポイント → 使用画面（保つべき境界の逆引き）

この契約を保てば、UIを作り替えても機能は保たれる。

| エンドポイント | 使う画面 |
|---|---|
| `/api/attachments` | /bulk-send, /settings/templates |
| `/api/attachments/{id}` | /settings/templates |
| `/api/auth/gmail` | /settings |
| `/api/auth/login` | /login |
| `/api/auth/logout` | /settings |
| `/api/bulk-send` | /bulk-send |
| `/api/bulk-send/preview` | /bulk-send |
| `/api/collection/activity?after=<lastId>` | /collection |
| `/api/collection/retry-failed` | /collection |
| `/api/collection/run` | /collection |
| `/api/collection/sources` | /collection |
| `/api/collection/sources/:id` | /collection |
| `/api/collection/status` | /collection |
| `/api/companies` | /bulk-send, /generate, /collection/companies, /collection/search |
| `/api/companies/enrich-pending` | /collection/companies |
| `/api/companies/gen-status` | /generate, /collection/companies |
| `/api/companies/re-enrich` | /collection/companies |
| `/api/companies/reconcile` | /collection/companies |
| `/api/generate` | /, /generate |
| `/api/import/parse` | /bulk-send |
| `/api/keyword-search/companies` | /collection/search |
| `/api/keyword-search/resolve` | /collection/search |
| `/api/keyword-search/site` | /collection/search |
| `/api/personas` | /, /generate, /settings, /settings/personas |
| `/api/personas/{id}` | /settings/personas |
| `/api/prospects` | /, /bulk-send, /collection/search, /history, /settings |
| `/api/prospects/[id]` | /bulk-send |
| `/api/prospects/bulk-schedule` | /bulk-send |
| `/api/prospects/export` | /history |
| `/api/prospects/send-counts` | /history |
| `/api/prospects/{id}` | /prospect/[id] |
| `/api/prospects/{id}/cancel-schedule` | /history |
| `/api/prospects/{id}/followup` | /prospect/[id] |
| `/api/prospects/{id}/regenerate` | /prospect/[id] |
| `/api/prospects/{id}/status` | /history, /prospect/[id] |
| `/api/send` | /bulk-send, /prospect/[id] |
| `/api/senders` | /bulk-send, /prospect/[id], /settings |
| `/api/services` | /, /bulk-send, /generate, /collection, /history, /settings, /settings/services |
| `/api/services/parse` | /settings/services |
| `/api/services/parse-file` | /settings/services |
| `/api/services/{editingId}` | /settings/services |
| `/api/services/{service.id}` | /settings/services |
| `/api/settings` | /bulk-send, /collection/search, /prospect/[id], /settings |
| `/api/suppressions` | /history, /prospect/[id], /settings/suppressions |
| `/api/templates` | /bulk-send, /generate, /prospect/[id], /settings/templates |
| `/api/templates/{id}` | /settings/templates |
| `/api/templates/{id}/attachments` | /settings/templates |

---

## ページ別 詳細マップ

### `/` （595行）

**ファイル**: `C:/tmp/ai-mail-check/app/page.tsx`

**役割**: 営業メール自動化アプリのダッシュボード。4つのKPIメトリクス表示、URL＋サービス＋人格を選んでメールを1件生成する「クイック生成」フォーム、直近5件の生成履歴テーブル/カードを表示する。実際の一斉送信・dedup・予約・警告承知フローはこのページには無く別ページ（/generate, /history, /prospect/[id] 等）にある。

**叩くAPI（＝保つべき契約）**

| endpoint | method | いつ |
|---|---|---|
| `/api/prospects` | GET | mount時 useEffect の Promise.all で1回取得（履歴・メトリクス算出の元データ） |
| `/api/services` | GET | mount時 useEffect の Promise.all で1回取得（サービス選択肢・serviceMap・サービス数） |
| `/api/personas` | GET | mount時 useEffect の Promise.all で1回取得（人格選択肢） |
| `/api/generate` | POST | 「生成」ボタン押下 handleQuickGenerate。body: {serviceId:Number, personaId:Number, url:trim, force:false, forceLow:false}, Content-Type application/json |

**クライアント側ロジック（再実装が必要）**

- mount時に prospects/services/personas を Promise.all で並列取得。各 res.ok が false なら空配列にフォールバック、catch は握り潰し、finally で loading=false（AbortではなくcancelledフラグでsetState抑止）
- sorted: prospects を created_at 降順ソート（useMemo）。recentProspects = 先頭5件のみ表示
- serviceMap: services を Map<id,name> 化し、テーブルでサービス名解決（無ければ #id 表示）
- thisMonth: created_at が現在の年月に一致する件数（今月の生成メトリクス）
- highCompatRate: compatibility_score==='high' の割合を四捨五入%（totalCount 0 の時は 0）
- canQuickSubmit ガード: !isBusy かつ status!=='done' かつ serviceId/personaId/url.trim() 全て入力済み。未充足なら送信不可
- handleQuickGenerate の疑似進捗ステップマシン: crawling→(2200ms後)analyzing→(4400ms後)generating を setTimeout で自動遷移。タイマーは timersRef に push し、レスポンス到着時と catch で必ず clearTimeout、unmount時にも全 clearTimeout
- /api/generate レスポンス4分岐: (1)!res.ok→status'error'+data.error表示 (2)duplicate→status'done'+router.push(/prospect/existingId) (3)lowCompatibility→status'idle'+router.push(/generate?url=...) (4)prospect→status'done'+router.push(/prospect/id)。どれにも当たらなければ'error'『予期しない応答です。』
- QuickProgressBar: QUICK_STEPS(crawling15/analyzing50/generating85/done100%)から現在stepのpctを引き、3ステップのチェック/スピナー/未完丸アイコンと%バーを描画

**⚠️ 安全/UX 要注意（誤移植＝退行）**

- /api/generate 呼び出しの body に force:false / forceLow:false を必ず送っている。UI改修で欠落・true化すると、重複ガードや低相性ガードのサーバ判定を勝手にバイパスしてしまう（この2フラグはエンジンとの契約）
- レスポンス3種の分岐（duplicate / lowCompatibility / prospect）ごとに遷移先が異なる。duplicate は既存 prospect 詳細へ、lowCompatibility は /generate?url= に URL を encodeURIComponent 付きで引き継ぐ。この分岐を潰すと『重複なのに再生成』『低相性を警告なく生成』の退行
- STEP_DELAY_MS(2200)の疑似進捗は実処理進捗ではなく見せかけ。タイマーの clearTimeout（成功/失敗/unmount 3経路）を欠くとステータスが実結果を上書きしたり leak する
- 各 fetch の res.ok フォールバック（空配列）を外すと、1API失敗で画面全体が throw して真っ白になる
- compatibility_score のラベル/スタイルは COMPATIBILITY_LABELS/STYLES の辞書引き＋未知値フォールバック付き。辞書に無い値で色が消えないようフォールバック維持が必要
- canQuickSubmit の status!=='done' 条件を外すと done後に多重送信できてしまう

**ページ間state（受け渡し）**

- router.push(`/prospect/${id}`) — 生成成功 or 重複時に prospect 詳細へ遷移
- router.push(`/generate?url=${encodeURIComponent(url)}`) — 低相性時に詳細生成フォームへ URL をクエリで引き継ぎ
- next/link href='/generate'（詳細フォーム・空状態のCTA）, href='/history'（すべて見る）, href=`/prospect/${prospect.id}`（各履歴行）
- sessionStorage は不使用。ページ間状態は router.push の URL パス/クエリのみ
- mount時に /api/prospects,/api/services,/api/personas を読む以外の永続ストレージ読取は無し

**UX/IA 要素の棚卸し**

- KPIメトリクスカード4枚: 総生成数 / 今月の生成 / 高相性率% / サービス数（各アイコン＋色）
- クイック生成カード: サービスselect・人格select・企業URL input(type=url, Globeアイコン)・生成ボタン（busy時スピナー）
- 『詳細フォームへ』リンク → /generate
- 疑似進捗バー QuickProgressBar（企業HP取得中→分析中→作成中の3ステップ＋%）
- エラーバナー（Warningアイコン＋メッセージ＋『再試行』ボタン、赤系）
- 最近の生成カード: 『すべて見る』→/history リンク
- 履歴の空状態: Trayアイコン＋『まだ生成履歴がありません。』＋『メールを作成する』→/generate
- 履歴のレスポンシブ2表示: md未満はカードリスト / md以上はテーブル（日付・会社名・サービス・相性・件名・詳細）
- 相性バッジ（高/中/低の色分けpill）
- 各行『詳細』→/prospect/[id] リンク
- select のカスタム CaretDown アイコン
- loading中の全画面スピナー(SpinnerGap)

**使用コンポーネント**

- （なし）


### `/bulk-send` （2613行）

**ファイル**: `C:/tmp/ai-mail-check/app/bulk-send/page.tsx`

**役割**: 営業メールの一括送信画面。宛先リストを作り（手動/スプシCSV取込/送信履歴/企業一覧から追加）、テンプレ or 直接入力 or {{AI:}}生成でメール本文を作り、送信元アカウントを選んで直列に一括送信・予約する。加えて別画面で生成済みの個別メール(prospects)を各社へまとめて送るモーダルを内包する。

**叩くAPI（＝保つべき契約）**

| endpoint | method | いつ |
|---|---|---|
| `/api/templates` | GET | mount時 初期ロード(Promise.all)。テンプレ一覧取得 |
| `/api/prospects` | GET | mount時 初期ロード。生成済みメール/送信履歴/企業データの元になるProspect一覧取得 |
| `/api/settings` | GET | mount時 初期ロード。test_mode判定 |
| `/api/senders` | GET | mount時 初期ロード。送信元アカウント(人格)一覧。先頭を既定選択 |
| `/api/attachments` | GET | mount時 初期ロード。添付資料ライブラリ |
| `/api/services` | GET | mount時 初期ロード。商材(service_id→名前)フィルタ用 |
| `/api/import/parse` | POST | CSV/Excelファイル選択時 handleImportFile。FormData(file)でサーバパース。headers/rows/columnKinds/truncatedを返す |
| `/api/companies` | POST | 列マッピング確定 handleApplyMapping で lp_url列があるとき。個社LP(source=csv_import,rows)を保存 |
| `/api/companies` | GET | 企業一覧モーダルを初めて開いたとき openCompaniesModal。companies/contactsを取得(取得済みなら再取得しない) |
| `/api/bulk-send/preview` | POST | 「選択したN件を生成」handleGenerateAll の直列ループ内(宛先ごと1回)。{{AI:}}を解決した個別本文subject/body/warningsを返す |
| `/api/bulk-send` | POST | 「選択したN件を送信/予約」handleSendAll の直列ループ内(宛先ごと1回)。実送信。scheduledAt指定で予約 |
| `/api/prospects/bulk-schedule` | POST | 生成済みメールモーダルで予約日時ありのとき handleSendGenerated。prospectIds一括をサーバ側で予約。failed[]を返す |
| `/api/send` | POST | 生成済みメールモーダルで即時送信のとき handleSendGenerated の直列ループ内(prospectごと1回)。prospectId+toEmailで送信/予約 |
| `/api/prospects/[id]` | PUT | 生成済みメールモーダルで内容編集を保存 handleSaveGenEdit。subject/bodyを更新(この内容で送信される) |

**クライアント側ロジック（再実装が必要）**

- 送信の直列ループ(handleSendAll): toSendを for-of で1件ずつ /api/bulk-send にawait、各件後に setTimeout 300ms。cancelRef.current で現在1件を送り終えてから中断(stoppedAtで未送信数集計)
- 生成の直列ループ(handleGenerateAll): toGenerate を1件ずつ /api/bulk-send/preview にawait、cancelGenerateRef で中断。generateProgress{done,total}で進捗表示。結果を generatedEmails[recipientId] に格納
- 一括送信の重複除外(#7): candidatesをemail小文字keyで走査、初出のみtoSendへ、以降はduplicateRowsに入れrowStatusを failed『同一メールアドレス重複によりスキップ(先頭1件のみ)』に。確認ダイアログにも(重複N件除外)注記
- 送信対象の絞り込み(handleSendAll): checkedRecipients から email有り かつ rowStatus!=='sent' のものだけ candidates
- 生成済みメール送信のdedup(handleSendGenerated): generatedChecked のうち send_status!=='sent'&&!=='scheduled' かつ firstEmailOf有り を、宛先メール小文字keyで最初の1件だけ targets へ
- genSelectable: generatedProspects(作成日時降順)を走査し 各宛先メールの最新1件のみ・送信済/予約済/メアド無しを除外。全選択・既定選択の対象。genSelectableIdsに含まれない同一宛先はisOlderDup=重複バッジ
- 予約分岐: bulkScheduledAt/genScheduledAt があれば ISO化。現在時刻以下ならエラーtoastで中止。生成済みメール予約はサーバ一括(/api/prospects/bulk-schedule)で途中離脱でも全件確実に予約、即時はフロント直列
- 警告承知フロー(acknowledgedWarnings): 送信系API全てに allowWarnings を渡す。フッターの『要確認の指摘があっても送信する』チェックと連動(hasGenerated時のみ表示)
- スプシ貼り付けパース parseSpreadsheetText: 各行をtab優先(3列以上)/カンマ分割、@を含む列をemail、残りをcompany/personに割当
- CSV列マッピング handleApplyMapping: columnKindsからemail/company/person/lp_url列index特定。email必須。既存recipientsのemail小文字集合で重複スキップ、集計(skipped)
- 差し込みプレビュー buildEmail: resolveEmailVariables(subject,body,{company_name,person_name})でクライアント側解決(社名の単純文字列置換はしない設計)。行hover300msでインラインプレビュー、未解決変数を表示
- 生成結果編集: generatedEmails[id]をsubject/body編集可(handleUpdateGenerated)。右パネルで resolveEmailVariables して『実際に届くメール』を表示。previewIndexで前後ナビ
- 生成済みメール個別編集 handleSaveGenEdit: /api/prospects/[id] PUT。genEditingId/genEditSubject/genEditBody の下書き状態機械(toggleGenEdit)
- 状態機械: rowStatus[recipientId] と genRowStatus[prospectId] = sending|sent|scheduled|failed(+error/warning)。送信/予約成功で prospects の send_status もローカル更新
- 生成時warnings保持(#5): /api/bulk-send/preview の warnings を generatedEmails に保持し編集パネルで表示(送信時は生成済み本文を送るためサーバ側{{AI:}}ゲートが発火しないので、ここで拾わないと無警告で汎用文が飛ぶ)

**⚠️ 安全/UX 要注意（誤移植＝退行）**

- 送信済み(send_status==='sent')・予約済み(send_status==='scheduled')は選択対象から外す。genSelectable/handleSendGenerated双方でガード。予約済みも『対応済み』として送信済みと同等に扱う(退行させると二重送信)
- 一括送信の同一メール重複は先頭1件のみ送信し、残りはfailedでスキップ表示(#7 二重送信防止)。この除外を落とすと同一宛先へ複数送信
- 各宛先メールは最新1件だけを送信対象にするdedup(generatedProspectsは作成日時降順=先頭が最新)。古い重複は『重複(最新を選択中)』バッジで無効化。誤ると古い本文を送る
- 生成メールのwarnings(会社ごとの個別文面になっていない=汎用文警告)を編集パネル/生成結果パネルに表示。送信時サーバゲートが効かないためUI表示が唯一の防波堤(#5)
- acknowledgedWarnings(allowWarnings/『要確認でも送信』)を全送信APIに正しく伝播。既定false。承知していないのに送る/承知フラグを送り忘れると挙動が変わる
- 予約日時は現在より未来必須のバリデーション。過去指定はtoastで中止
- テストモード時はconfirm文言・送信ボタン文言が変わり全メールがテストアドレス宛。testModeバッジ表示を落とすと本番誤送信の誤認
- テンプレ変更時に選択添付・生成本文キャッシュ・rowStatusを破棄(handleTemplateChange)。旧テンプレ本文を新テンプレIDで送る取り違え防止(F22)
- 添付不許可テンプレ(allow_attachments=false)では添付欄自体を出さない。残すとサーバ422で全件失敗(F22)
- 送信中断は『現在の1件を送り終えてから停止』(cancelRef)。即時停止に変えると送信途中の不整合
- 確認ダイアログ(confirm)を送信/予約前に必ず出す。件数・送信元・重複除外数・予約時刻を明示

**ページ間state（受け渡し）**

- sessionStorage 'bulk-send-recipients': recipients配列をJSON永続化。mount時に読み復元し、以後 recipients 変更で書込(0件でremove)。recipientsHydratedフラグで初回書込を制御
- sessionStorage 'bulk-send-import': 他画面から渡された取込宛先{company,person,email}[]。mount時に読んで即removeItem(消費一回)、recipientsへ checked:true で追加
- beforeunload警告: isSending中 または recipients>0 のときページ離脱を警告(e.preventDefault)
- Linkによる遷移: /settings(Gmail未接続時)、/settings/templates(テンプレ0件/添付不許可時)。router.pushは未使用

**UX/IA 要素の棚卸し**

- 入力モード切替タブ: テンプレートから送信 / 直接入力して送信
- 取込モーダルのタブ: スプシからコピペ / CSVファイル
- 4つの宛先追加ボタン(テーブル下フッター): 1件追加 / スプシ・CSV / 送信履歴から追加 / 企業一覧から追加
- 警告バナー: Gmail未接続 / テンプレ0件 / テストモード中バッジ / 添付不許可の案内
- 宛先テーブル: 全選択チェック・行チェック・企業名/担当者名/メール インライン編集・状態列(sending spinner/sent check/⏰予約/failed X)・プレビュー(Eye)ボタン・削除(Trash)・hover行インラインプレビュー・failed理由行・sent warning行
- 右パネル(3状態): 生成結果編集(hasGenerated) / メール作成(direct、変数挿入チップ+{{AI:}}チップ+差し込みプレビュー) / 送信プレビュー(template)。previewIndex前後ナビ
- フッターアクションバー: 選択件数表示 / 『要確認でも送信』チェック / 中断ボタン / 生成ボタン(進捗N/N) / 予約datetime-local / 送信・予約ボタン(件数・予約で文言変化)
- 送信元アカウントselect(要再認証表示)・テンプレートselect・添付資料トグルチップ(選択済Check/未選択Paperclip+サイズ)
- 履歴モーダル: 検索・商材フィルタselect・全選択・企業ごとチェック(メール列挙・日付)・選択数フッター・宛先に追加
- 企業一覧モーダル: 検索・キーワードフィルタ・商材フィルタ・全選択・企業カード(連絡先メール・keyword/service/sourceバッジ・ドメイン)・選択数・宛先に追加
- 取込モーダル: paste textarea+検出件数 / CSVアップロードドロップゾーン / 列マッピングテーブル(kind select: 企業名/担当者名/メール/個社LP/使わない、先頭5行プレビュー)・別のファイル・追加ボタン
- 生成済みメール送信モーダル(最重要): 検索・メアド有無フィルタ・商材フィルタ・全選択(送信可能N件)・行(チェック無効化=送信済/予約済/メアド無し、company/subject、email/重複/商材/送信済/予約済/処理状態バッジ、内容ボタン=inline件名本文編集保存、引用ボタン)・予約datetime-local・送信ボタン(予約送信/テスト送信/選択を各社へ送信)
- バッジ類: 宛先件数丸バッジ / ⚠️メアド無し / 重複(最新を選択中) / 📦商材 / 📨送信済み / ⏰予約済み / 🔍キーワード / source(キーワード検索/Wantedly/CSV取込/手動追加)

**使用コンポーネント**

- Toast (@/components/toast) — showToast経由の通知
- Modal (@/components/modal) — 履歴/企業一覧/取込/生成済みメール の4モーダル(open,onClose,labelledBy)
- @phosphor-icons/react のアイコン群(Buildings,CaretDown,Check,EnvelopeOpen,Eye,MagicWand,MagnifyingGlass,Paperclip,Plus,SpinnerGap,Trash,UploadSimple,Warning,X,PaperPlaneTilt,CaretLeft/Right,FileArrowUp,PencilSimple,ArrowsClockwise,ClockCounterClockwise)
- next/link Link — /settings, /settings/templates への導線
- @/lib/variables resolveEmailVariables — クライアント側差し込み解決(プレビュー用)
- @/lib/types 型(Attachment,CompanyWithTag,Contact,Prospect,Service,TemplateWithAttachments)
- @/lib/import-parse ColumnKind型(CSV列種別)


### `/generate` （1330行）

**ファイル**: `C:/tmp/ai-mail-check/app/generate/page.tsx`

**役割**: 企業URLまたは調査済み企業リストから、HP自動分析→相性判定→パーソナライズ営業メールを生成する画面。「1社（single）」と「まとめて（batch）」の2モードを持ち、生成後は個別プロスペクト詳細へ遷移、またはバッチ進捗を表示する。

**叩くAPI（＝保つべき契約）**

| endpoint | method | いつ |
|---|---|---|
| `/api/services` | GET | mount時 loadOptions() の Promise.all（サービス選択肢） |
| `/api/personas` | GET | mount時 loadOptions() の Promise.all（人格選択肢） |
| `/api/templates` | GET | mount時 loadOptions() の Promise.all（テンプレート選択肢） |
| `/api/companies` | GET | mount時 loadOptions() の Promise.all。レスポンス {companies, contacts} を使い、hp_url あり かつ enrichment_status==='done' の企業のみ表示、contacts から email 保有 company_id 集合を作る |
| `/api/companies/gen-status` | GET | mount時 loadOptions() の Promise.all、およびバッチ生成完了後 refreshGenStatus() で再取得。{sentDomains, generatedDomains} を返す（ドメイン単位・正規化済み） |
| `/api/generate` | POST | single: handleGenerate() ボタン押下時に1回。batch: processOneCompany() から並列3本の直列ループで各企業ごとに呼ぶ（AbortController signal 付き）。body={serviceId,personaId,url,force,forceLow,tone,length,cta,additionalInstructions?,fixedText?,templateId?} |

**クライアント側ロジック（再実装が必要）**

- mode 状態機械 single/batch。切替時に batchItems と selectedCompanyIds をクリア
- single生成: setStatus('crawling')→2秒後'analyzing'→4秒後'generating' の疑似進捗タイマー（STEP_DELAY_MS=2000, timersRef で管理・unmount時clearTimeout）。/api/generate 応答で done/duplicate/low-compat/error に分岐。done時 router.push(`/prospect/${id}`)
- 応答の型判別: isSuccessResponse(prospect有), isDuplicateResponse(duplicate===true), isLowCompatibilityResponse(lowCompatibility===true), isErrorResponse(error:string)。この4分岐の順序と網羅を保つこと
- バッチ生成: CONCURRENCY=3 のワーカー並列。cursor を共有し runNext() が while で次の未処理indexを取る。各社 processOneCompany で処理。全ワーカー Promise.all 後に batchRunning=false と refreshGenStatus()
- processOneCompany のリトライ: MAX_RETRIES=1。errorレスポンスの retryable フラグが true の時だけ再試行、待機は attempt*3000ms。AbortError は即 error 'これ以上リトライしない'
- バッチは force:true, forceLow:true 固定（重複・相性低でもスキップ扱いにするが生成強制はしない＝duplicate→status:'skipped' skipReason:'生成済み'、lowCompat→'skipped' skipReason:'相性低'）
- 中止フロー: abortRef.current=true でループ停止＋abortControllerRef.current.abort() で進行中fetchをキャンセル
- CompanyPicker のフィルタ多段: keyword / service / email(has/none) / status(none/generated/sent) / 検索クエリ(name/domain部分一致)。useMemo で filtered を算出
- 全選択 handleToggleAll: filtered全選択済みなら filtered分だけ解除、そうでなければ既存選択に filtered を union（フィルタ外の選択を保持する差分ロジック）
- 企業状態分類 statusById: classifyGenStatus(domain, sentDomains, generatedDomains) で送信済み>生成済み>未生成の優先順に1状態へ集約（useMemo）
- URLクエリ mode=batch 時、sessionStorage 'batch-generate-company-ids' を読んで selectedCompanyIds を復元し即 removeItem

**⚠️ 安全/UX 要注意（誤移植＝退行）**

- companies 表示は hp_url あり かつ enrichment_status==='done' のみ。調査未完了企業を送信先に混ぜない
- gen-status バッジ（送信済み/生成済み・未送信/未生成）は domain 突き合わせ。送信済み>生成済み>未生成の優先順位（classifyGenStatus）を崩すと状態誤表示
- バッチは重複(duplicate)・相性低(lowCompat)を error でなく skipped として扱い、生成済みは再生成しない。この分岐を error にまとめると二重生成・誤失敗表示に退行
- メアド未取得バッジ（⚠️）を消すと、送信不能な相手に生成してしまう判断材料を失う
- 生成中(isBusy)は beforeunload 警告 と 内部相対リンククリック抑止（ページ離脱でバッチ中断させない安全策）。これを落とすと生成途中離脱でロスト
- バッチ完了後の refreshGenStatus() を落とすとバッジ・生成状態フィルタが古いまま残り、既送信/生成済みを再度選んで重複生成する危険
- AbortController によるバッチ中止が効かなくなると、停止ボタンを押しても走り続けて課金/送信が続く
- selectedTemplateId 指定時は tone/length/cta のUIを隠す（テンプレが文体・長さ・CTAを管理）。テンプレ選択中に個別指定を送ると二重制御になる
- fixedText は『AIが改変せず全メールにそのまま挿入』の契約。編集可能テキストとして扱いを変えると意図せぬ改変

**ページ間state（受け渡し）**

- sessionStorage キー 'batch-generate-company-ids'（他ページから企業IDリストを渡す。mount時 mode=batch なら読取→復元→即 removeItem）
- URLクエリ読取（useSearchParams, loadingOptions 完了後）: url / service / persona / mode。service・persona は実在チェック後にセット、mode==='batch' で batchモードへ
- router.push('/prospect/{id}'): single生成成功時、および DuplicateDialog『過去の結果を見る』時に遷移
- BatchProgress 内の各 prospectId から個別プロスペクトへ（batchItemに prospectId/companyName を保持）

**UX/IA 要素の棚卸し**

- モード切替トグル（1社 / まとめて）
- 警告バナー: サービス未登録・人格未登録（登録リンク付き）
- 左カラム基本設定: サービスselect / 人格select / (single)企業URL入力 or (batch)CompanyPicker / 生成ボタン
- 生成ボタン表記: single='メールを生成'、batch='N社 まとめて生成'、生成中はスピナー
- 右カラムカスタマイズ: テンプレートselect / トーン(formal/balanced/friendly) / 文章量(short/standard/long) / CTA(online_meeting/phone/send_materials/seminar) / 固定テキストtextarea / 追加指示textarea
- CompanyPicker: 企業名検索入力＋選択数バッジ / メアド有無select / 生成状態select / キーワードselect / 商材select / すべて選択チェックボックス（N社）/ 各社チェックボックス行
- 企業行バッジ群: 生成状態(GEN_STATUS_META) / メアド有無 / collection_keyword / collection_service_name / source(sourceLabel)
- single進捗カード ProgressCard（crawling15%/analyzing50%/generating85% のプログレスバー＋3ステップ表示）
- batch進捗 BatchProgress（停止ボタン付き）
- モーダル的インライン確認: DuplicateDialog（過去結果を見る/新規作成/キャンセル）, LowCompatDialog（それでも生成する/キャンセル）, ErrorCard（再試行）

**使用コンポーネント**

- ./batch-progress の BatchProgress（および型 BatchItem）— このルート配下ローカルコンポーネント。共通 components/ 由来の import は無し
- @/lib/gen-status の classifyGenStatus / GenStatus 型（状態分類ロジック）
- @phosphor-icons/react アイコン（PaperPlaneTilt, Globe, CaretDown, Check, SpinnerGap, Warning, Lock, MagnifyingGlass）
- next/link Link, next/navigation useRouter/useSearchParams
- 同ファイル内ローカル子: CompanyPicker, ProgressCard, DuplicateDialog, LowCompatDialog, ErrorCard


### `/collection` （665行）

**ファイル**: `C:/tmp/ai-mail-check/app/collection/page.tsx`

**役割**: 営業メール自動化の「在庫と自動収集」画面。収集元（キーワード常時／WantedlyのURL巡回／Wantedly新着）の登録・一時停止・削除・手動収集を管理し、送れる宛先の在庫(残日数)・準備中/調査失敗件数・実行履歴・活動ログを可視化する、UIとバックエンド収集エンジンの操作面。

**叩くAPI（＝保つべき契約）**

| endpoint | method | いつ |
|---|---|---|
| `/api/collection/status` | GET | load()内。mount直後(setTimeout 0)＋ポーリング(収集中5秒/通常30秒間隔)＋「更新」ボタン。CollectionStatus(在庫/残日数/isRunning等)を取得しjobRunningを設定 |
| `/api/collection/sources` | GET | load()内。同上のタイミング。SourcesResponse{sources,runs}を取得 |
| `/api/services` | GET | load()内。同上。商材タグ(service)のselect用。data.services配列 or data自体を許容 |
| `/api/collection/sources` | POST | 3種の追加フロー: handleAdd(キーワード常時: {keyword,site,service_id})/handleAddWantedly({source_type:'wantedly_direct'})/handleAddUrl({source_type:'wantedly_url',url,service_id})。成功後load() |
| `/api/collection/sources/:id` | PATCH | patchSource()。一時停止/有効化({is_active:boolean})と自動停止からの再開({action:'resume'})。成功後load() |
| `/api/collection/sources/:id` | DELETE | handleDelete()。confirm確認後に収集元を削除。成功後load() |
| `/api/collection/run` | POST | handleRunNow()「今すぐ収集」ボタン。レスポンスdata.startedでjobRunning=true、data.reasonを失敗理由に表示 |
| `/api/collection/retry-failed` | POST | handleRetryFailed()。InventoryPanelの『N社をもう一度調べる』ボタン経由。data.resetで件数表示、成功後load() |
| `/api/collection/activity?after=<lastId>` | GET | ActivityLogPanel内。パネルを開いている間だけ2秒ポーリング。after=最後に受信したentry.idで差分取得(増分ロング風ポーリング) |

**クライアント側ロジック（再実装が必要）**

- ポーリング切替: jobRunning(=status.isRunning)がtrueなら5秒間隔、falseなら30秒間隔でload()をsetInterval。jobRunning変化でuseEffectが張り替わる
- load()はstatus/sources/servicesをPromise.allで並列fetchし、各resのokを個別判定して部分的に反映。catchは握りつぶし(次回更新で回復)、finallyでloading解除
- services応答の形ゆれ吸収: Array.isArray(data.services)?data.services:data
- keyword追加時のURL誤入力ガード: /^https?:\/\//i もしくは /\b[\w-]+\.[a-z]{2,}\/\S/i にマッチしたらPOSTせずトーストで案内(URLはWantedly貼付欄/ドメインはsite欄へ誘導)
- hasWantedlySource: sources.some(source_type==='wantedly_direct') でWantedly新着追加ボタンの表示/非表示を制御(重複追加防止)
- hasActiveSources: sources.some(is_active===1 && !paused_kind)。falseならhandleRunNowはPOSTせずnoSourceError表示
- 収集元の有効判定 isActive = source.is_active===1 && !source.paused_kind。表示の点/バッジ/opacityとボタン分岐に使用
- ボタン分岐: paused_kindがあれば『再開する』(action:'resume')、無ければis_activeトグル(『一時停止』/『有効にする』)
- showToast: setToast(null)→setTimeout(0)で再セットし、同一メッセージ連投でもToastを再マウントさせる
- formatDateTime: 空→'—'。' '→'T'置換しTZ無しならZ付与してUTC解釈→Asia/Tokyoでja-JP整形。パース失敗時は元文字列を返す
- 実行履歴テーブル: RUN_STATUS_LABELS/RUN_STATUS_STYLESでstatus→日本語ラベル/色。備考は run.error 優先、無ければ skipped_count>0 で『N件は登録済み』
- 各追加/更新ハンドラは saving/addingWantedly/addingUrl/running 等のフラグで二重送信ガード(先頭でreturn)
- ActivityLogPanel: openの間のみポーリング。lastId.currentで差分積み上げ、直近MAX_ENTRIES=200件にslice、新着でendRefへsmoothスクロール、cancelledフラグで後片付け

**⚠️ 安全/UX 要注意（誤移植＝退行）**

- 収集元の有効判定は必ず is_active===1 && !paused_kind の複合条件。paused_kind(自動停止)を無視してis_activeだけで判定すると、ブロック中の収集元を『収集対象』と誤表示し危険
- paused_kind の値で色分け: 'blocked'は危険色(danger)、それ以外(warning系)は警告色。paused_reasonの原文をそのまま表示している(意訳しない)
- 自動停止(blocked)からの復帰は通常のis_activeトグルではなく action:'resume' の別API契約。ここを取り違えると再開できない/意図せず状態を壊す
- hasWantedlySource による『Wantedly新着を追加』ボタンの出し分けを保持しないと wantedly_direct を重複登録できてしまう
- handleRunNow の hasActiveSources ガードを外すと、有効な収集元ゼロでも収集APIを叩けてしまう(現状はnoSourceErrorで抑止)
- keyword欄のURL誤入力ガード(正規表現2種)は永久0件検索を防ぐ実害対策。UI作り替えで落とすと無効な収集元が量産される
- handleDelete の confirm(削除確認・『収集済み企業は残る』注記)を省略しない
- InventoryPanel: hasBlockedSource と isLowStock の警告バナー(自動停止/在庫僅少)は営業停止の第一原因への気づき装置。表示条件 isLowStock && !hasBlockedSource の排他も維持
- status.failedEnrichment>0 のときだけ『N社をもう一度調べる』(retry-failed)を出す条件を保持
- 活動ログの after=lastId 差分ポーリングを崩すと全件重複表示やID巻き戻りが起きる

**ページ間state（受け渡し）**

- このページ単体では sessionStorage / router.push / URLクエリによるページ間状態の受け渡しは無し(自己完結)
- ActivityLogPanel のみ after=<lastId> をURLクエリとして自APIに渡す(ページ遷移ではなくfetchのクエリ)
- 状態は全て /api 経由のサーバ状態(status/sources/runs/services/activity)。クライアントはmount時とポーリングで都度取得しローカルstateに保持

**UX/IA 要素の棚卸し**

- ヘッダ右上(lg以上)にCompactStat 4枚: すぐ送れる宛先/残り日数/準備中/調査できず(isLowStockでwarning着色)
- 上部説明＋最終実行時刻、右に『更新』ボタンと『今すぐ収集』ボタン(実行中はスピナー+disabled)
- noSourceError の赤警告文(キーワード追加を促す)
- 『Wantedly新着を収集元に追加』の破線ボタン(未追加時のみ)
- 🔗URL巡回フォーム: WantedlyのURL入力+『このURLから収集』ボタン
- 🔑キーワード常時フォーム: keyword入力 / 検索元サイト(任意) / 商材タグselect(services) / 『追加』ボタン
- 収集元リスト: 各行に状態ドット・方式バッジ(🆕Wantedly新着/🔗URL巡回/🔑キーワード常時)・名称(URL or keyword)・『収集対象』バッジ・最終実行時刻・paused理由バナー・[一時停止/有効にする or 再開する]・削除アイコン
- 収集実行中バナー(jobRunning): スピナー＋無限プログレスバー
- ActivityLogPanel: 折りたたみ式『活動ログ』、件数バッジ、ターミナル風ログ表示
- InventoryPanel: 自動停止/在庫僅少の警告バナー、モバイル用Metric 4枚、失敗社の再調査ボタン
- 『実行の記録』テーブル: 日時/結果(色付きラベル)/取得/新規/備考

**使用コンポーネント**

- @/components/toast (Toast)
- ./activity-log-panel (ActivityLogPanel) — 同ディレクトリの子コンポーネント
- ./inventory-panel (InventoryPanel) — 同ディレクトリの子コンポーネント
- @phosphor-icons/react アイコン群(ArrowClockwise/Play/Plus/SpinnerGap/Trash、子: Terminal/Warning/WarningOctagon)
- ページ内ローカル部品: CompactStat / Metric(inventory内) / sourceMethod(方式バッジ生成) / formatDateTime


### `/collection/companies` （615行）

**ファイル**: `C:/tmp/ai-mail-check/app/collection/companies/page.tsx`

**役割**: 自動収集・キーワード検索・CSV取込で集めた企業の一覧テーブル。企業ごとの調査ステータス/連絡先メール/送信済み状態を表示し、HP追加・再調査・整合チェック・複数選択→メール生成への導線を提供する。

**叩くAPI（＝保つべき契約）**

| endpoint | method | いつ |
|---|---|---|
| `/api/companies` | GET | mount時 load() で /api/companies/gen-status と並列fetch。data.companies と data.contacts を取得。更新ボタン・各アクション完了後の load() でも再取得 |
| `/api/companies/gen-status` | GET | mount時 load() で並列fetch。gen.sentDomains(string[])を Set にして送信済み判定に使用 |
| `/api/companies` | PATCH | HP URL編集フォーム送信時 saveHpUrl()。body={id, hp_url}。成功時レスポンスの company で該当行をマージ更新 |
| `/api/companies/re-enrich` | POST | 「N社のメールを再取得」ボタン handleReEnrich()。noEmailCount>0 の時だけ表示。成功後 load() |
| `/api/companies/enrich-pending` | POST | 「準備中N社を調査」ボタン handleEnrichPending()。counts.pending>0 の時だけ表示。レスポンス data.started/queued/message を判定。成功後 load() |
| `/api/companies/reconcile` | POST | 「整合チェック」ボタン handleReconcile()。counts.done>0 の時だけ表示。レスポンス data.started/queued/message を判定。成功後 load() |

**クライアント側ロジック（再実装が必要）**

- load(): /api/companies と /api/companies/gen-status を Promise.all で並列取得。それぞれ res.ok を個別チェックし失敗は握りつぶし(次回リフレッシュで再試行)、最後に setLoading(false)
- contactsByCompany: contacts を company_id で Map<number, Contact[]> にグルーピング(company_id==null はスキップ)。表示メールは companyContacts[0]?.email(先頭1件)
- isSent(c): normGenDomain(c.domain) で正規化したドメインが sentDomains Set に含まれるか。単送信・一括・生成送信すべて含む送信済み判定
- filtered: 4条件のAND絞り込み — enrichment_status(all/done/pending/failed), collection_keyword, collection_service_id(String比較), sentFilter(sent/unsent を isSent で)
- selectableFiltered: filtered のうち hp_url を持つものだけが選択可能(チェックボックス表示対象)
- allSelectableChecked: selectableFiltered が空でなく全て selectedIds に含まれる時 true
- toggleAll(): 全選択済みなら空 Set、そうでなければ selectableFiltered の id 全部を選択
- toggleOne(id): Set の add/delete トグル(immutable に新 Set を返す)
- handleGenerateSelected(): companies から selectedIds かつ hp_url を持つ id を抽出→sessionStorage に保存→router.push('/generate?mode=batch')。ids が空なら何もしない
- keywordOptions: companies の collection_keyword の重複排除+ソート。serviceOptions: collection_service_id→name の Map をソート。どちらも該当がある時だけ select を表示
- counts: all/done/pending/failed/sent を companies から算出。未送信数は counts.all - counts.sent
- formatDate(): SQLite形式のスペース区切りを ISO 化し末尾に Z 補完、Asia/Tokyo で ja-JP 表示
- showToast(): setToast(null)→setTimeout(0)で再セット(連続表示のリセット用)

**⚠️ 安全/UX 要注意（誤移植＝退行）**

- 選択可能なのは hp_url を持つ企業のみ(selectableFiltered)。hp_url が無い行はチェックボックスを出さず空スペースにする。全選択・メール生成対象からも hp_url 無しを必ず除外(handleGenerateSelected でも二重に hp_url チェック)
- 送信済みバッジ(📨 送信済み)は isSent() = normGenDomain(domain) が sentDomains に含まれる時のみ。ドメイン正規化を normGenDomain で必ず通すこと(生ドメイン比較にすると送信済み検知が退行)
- 送信済み判定は単送信/一括/生成送信すべてを含む send_log 由来。gen-status API を落とすと送信済み表示・絞り込み・カウントが全滅する
- enrich系ボタンは条件付き表示(pending>0 / noEmail>0 / done>0)。ボタン実行中は disabled+スピナーで二重実行を防止(reEnriching/enrichingPending/reconciling/savingHpUrl フラグ)
- API レスポンスの started フラグで「開始した/対象なし」を出し分け。started を無視すると『0社に開始しました』の誤メッセージで退行
- エラーは全て握りつぶさず showToast でユーザー向けメッセージを出す(通信エラー含む)

**ページ間state（受け渡し）**

- sessionStorage.setItem('batch-generate-company-ids', JSON.stringify(ids)) — 選択企業idを一括生成用に受け渡し
- router.push('/generate?mode=batch') — メール生成ページへ遷移(mode=batch クエリ付き)。遷移先 /generate が sessionStorage の batch-generate-company-ids を読む前提
- mount時に読むもの: なし(URLクエリ・sessionStorage 読取は本ページには無し。/api/companies と /api/companies/gen-status を fetch するのみ)

**UX/IA 要素の棚卸し**

- ステータスフィルタタブ: すべて/完了(done)/準備中(pending)/調査できず(failed) 各カウント付き
- 送信絞り込み: 📨送信済み / 未送信 トグルボタン(再クリックで all に戻る)。区切り線あり
- キーワード絞り込み select(該当タグがある時だけ)
- 商材(service)絞り込み select(該当タグがある時だけ)
- アクションボタン群: 準備中N社を調査 / N社のメールを再取得 / 整合チェック / 更新(load)
- 企業テーブル: 全選択チェックボックス/企業名(送信済みバッジ・ドメイン・HP追加インライン編集フォーム)/メール/経路(source_detail or SOURCE_LABELS)/ステータス(アイコン+ラベル)/登録日
- HP追加インライン編集フォーム(url input + 保存 + キャンセル✕)
- 選択中スティッキーバー(下部固定): 選択件数・選択解除・メール生成ボタン
- 空状態メッセージ(企業0件 / 該当なし で文言出し分け)
- ローディングスピナー(loading中)
- STATUS_CONFIG(done/pending/failed/excluded のラベル・アイコン・色)、SOURCE_LABELS(keyword_search/auto_collection/csv_import/manual)

**使用コンポーネント**

- Toast (@/components/toast) — message/onDone
- ActivityLogPanel (../activity-log-panel) — 一覧下部の活動ログ
- @phosphor-icons/react アイコン群(CheckCircle/Hourglass/XCircle/WarningCircle/GlobeSimple/EnvelopeSimple/ShieldCheck/ArrowClockwise/SpinnerGap/PaperPlaneTilt 等)
- normGenDomain (@/lib/gen-status) — ドメイン正規化
- 型: CompanyWithTag, Contact (@/lib/types)


### `/collection/search` （809行）

**ファイル**: `C:/tmp/ai-mail-check/app/collection/search/page.tsx`

**役割**: キーワードから企業を探し、各社HPを解析してメールアドレス・宛名入りの宛先リストを自動生成する画面。AIまたは手動指定した検索元サイトから企業を検索し、結果を「一括送信リストに追加」または「企業リストに保存」できる。

**叩くAPI（＝保つべき契約）**

| endpoint | method | いつ |
|---|---|---|
| `/api/settings` | GET | mount時(useEffect)にprospectsと並列で取得。search_mode初期値とserper_api_key_configuredを読む |
| `/api/prospects` | GET | mount時(useEffect)に取得。send_status!==unsentの企業からsentDomains/sentNamesを構築（送信済み判定用） |
| `/api/settings` | PUT | 検索モードトグル(API/スクレイピング)切替時。body={search_mode}。レスポンスのserper_api_key_configuredでsearchReady再判定 |
| `/api/keyword-search/site` | POST | 検索開始(handleRun)時、aiAuto=trueの場合のみ。body={keyword}。AIが検索元サイトを判断し{site,reason}を返す |
| `/api/keyword-search/companies` | POST | 検索開始(handleRun)のsiteフェーズ後。body={keyword,site,maxCount}。企業リスト{companies:[{name,sourceUrl}],fallbackContact}を返す |
| `/api/keyword-search/resolve` | POST | resolving フェーズで各企業ごとに1回、最大3並列(RESOLVE_CONCURRENCY)。body={companyName,sourceSite}。{found,homepage,domain,email,formUrl,personName,recruitPageUrl}を返す |
| `/api/companies` | POST | 「企業リストに保存」ボタン(handleSaveToCompanies)。body={source:'keyword_search',sourceDetail,rows[]}。{companiesAdded,contactsAdded}を返す |

**クライアント側ロジック（再実装が必要）**

- 送信の並列ループ: initialRowsをqueueにし、RESOLVE_CONCURRENCY=3 個のworkerがqueue.shift()で取り出し順にresolveOneをawait。cancelRef.current=trueで各workerが停止。Promise.allで全worker完了を待つ
- 中止フロー: handleCancelがcancelRef.current=true(useRef)をセット。ループ内で毎回チェックし途中停止。完了後にトースト『処理を中止しました』
- phase状態機械: idle→(aiAuto時)site→searching→resolving→done。isBusy = site|searching|resolving
- 進捗率 progressPct: site=10, searching=30, resolving=30+round(resolvedCount/rows.length*65), done=100
- site文字列の正規化: siteInput.trim()から^https?://除去・/以降除去してドメインのみ抽出
- 送信済みdedup判定 isSentBefore: row.domain(小文字化・www.除去)がsentDomainsにあるか、またはrow.nameがsentNamesにあればtrue
- 初期チェック状態: 検索直後 checked = !sentNames.has(name)（送信済み名は最初から未チェック）
- resolve完了時の自動uncheck: 解析で得たdomainがsentDomainsにあれば checked=false に上書き（それ以外は既存checkedを維持）
- 除外フィルタ displayRows: excludeSent=true のとき isSentBefore の行を除外
- 全選択/全解除 handleToggleAll: displayRowsのidのみ対象にchecked一括変更（フィルタ外の行は触らない）
- selectedRows: displayRows のうち checked のもの。フッターの件数表示・保存/送信対象
- 宛名生成 contactLabel: personNameがあれば『{personName}様』、なければfallbackContact(既定『ご担当者様』、companies APIから上書き)
- 一括送信への受け渡し handleAddToBulkSend: selectedRowsを{company,person,email}配列にしsessionStorageへ格納後 /bulk-send へ遷移
- トースト表示 showToast: 一旦null→setTimeout(0)で再設定し連続表示でも再発火させる
- canRun判定: !isBusy && searchReady && keyword非空 && (aiAuto || siteInput非空)

**⚠️ 安全/UX 要注意（誤移植＝退行）**

- 送信済み企業の扱い: sentDomains/sentNamesにマッチする行は初期未チェック化＋resolve後もdomain一致でchecked=false化。これを外すと送信済みへの重複送信リスク
- 送信済みバッジと opacity-60 の視覚表現（デスクトップ状態列・モバイルカード両方）を残すこと
- excludeSent(送信済みを除外)フィルタと handleToggleAll がフィルタ後のdisplayRowsだけを対象にする点。全選択を全rowsに広げると非表示の送信済みまで選択される退行
- メール未検出の3分岐表示: email有→メール表示 / emailなしformUrl有→『フォームのみ（メール送信不可）』warning / 両方なし→『メール未検出』。フォームのみを送信可能と誤認させない
- 採用中バッジ(recruitPageUrl有=採用活動中シグナル)を保持。営業判断に使われる
- resolve失敗(status=failed)は『取得失敗』として明示。silentに成功扱いしない
- sessionStorage 'bulk-send-import' のスキーマ{company,person,email}を厳守。/bulk-send側が読む契約
- 企業リスト保存の重複除外はサーバ側。トーストで『重複は除外』と件数(companiesAdded/contactsAdded)を明示

**ページ間state（受け渡し）**

- sessionStorage.setItem('bulk-send-import', JSON.stringify([{company,person,email}])) — handleAddToBulkSendで格納
- router.push('/bulk-send') — 一括送信リスト追加後の遷移先
- Link href='/settings' — APIキー未設定時の導線
- 定数: AI_SITE_POOL, MAX_COUNT_OPTIONS (@/lib/keyword-search-constants)
- 型: Prospect (@/lib/types) — /api/prospects レスポンス。send_status/domain/company_nameを参照
- このページ自体はURLクエリ/mount時sessionStorage読取は行わない（読むのはsettings/prospects API）

**UX/IA 要素の棚卸し**

- 検索モード セグメントコントロール: API（高速・安定）/ スクレイピング（無料）。isBusy中はdisabled
- 検索フォーム: キーワード入力・検索先サイト入力・『AIにおまかせ』チェックボックス(aiAuto、ONで検索先入力をdisabled)・最大件数select(MAX_COUNT_OPTIONS)・『検索開始』ボタン
- APIキー未設定時: 『APIキーを設定』リンク(/settings)を表示
- 進捗パネル: phaseLabel・progressPct%・進捗バー・resolving中の『中止』ボタン・AIの判断(decidedSite.site/reason)表示
- エラーパネル runError: 赤系Warningアイコン付き
- 検索結果ヘッダー: 件数バッジ・via {site}表記・『送信済みを除外』チェック・『全選択』『全解除』ボタン
- 結果一覧: モバイル=カードリスト(md:hidden) / デスクトップ=テーブル(hidden md:block)。行チェックボックス・ヘッダ全選択チェック
- 状態表示: 待機中/HP解析中(スピナー)/取得失敗/取得済み/送信済みバッジ
- リンク列: 公式HP(Globe)・採用中バッジ(recruitPageUrl)・問い合わせフォーム(ArrowSquareOut)・出典(sourceUrl)
- フッター: 『{selected}/{display}件選択中』・『企業リストに保存』ボタン(saving中スピナー)・『選択したN件を一括送信リストに追加』ボタン。phase===doneかつ結果ありで表示

**使用コンポーネント**

- Toast (@/components/toast) — トースト通知


### `/history` （515行）

**ファイル**: `C:/tmp/ai-mail-check/app/history/page.tsx`

**役割**: 生成済み営業メール（prospect）の一覧＋予約送信の管理画面。検索/フィルタ/ソートで絞り込み、各行のステータス変更・予約取消・送信抑止(suppression)・詳細遷移・CSV出力を行う。送信自体はこのページでは行わない（詳細/生成側が担当）。

**叩くAPI（＝保つべき契約）**

| endpoint | method | いつ |
|---|---|---|
| `/api/prospects` | GET | mount時（useEffect内 Promise.all の1つ）。一覧本体を取得 |
| `/api/services` | GET | mount時（Promise.all）。service_id→名前マップとフィルタ用。失敗時は空配列でフォールバック |
| `/api/prospects/send-counts` | GET | mount時（Promise.all）。ドメイン→通算実送信数(Record<string,number>)。失敗時は空オブジェクトでフォールバック |
| `/api/prospects/{id}/status` | PUT | ステータスselect変更時 handleStatusChange。body {status}。Content-Type application/json |
| `/api/prospects/{id}/cancel-schedule` | POST | 予約取消ボタン handleCancelSchedule（confirm後）。bodyなし |
| `/api/suppressions` | POST | 送信しないリスト追加ボタン handleSuppress（confirm後）。body {target(domain), target_type:'domain', reason:'manual', note} |
| `/api/prospects/export` | GET | CSV出力ボタン handleExportCsv。window.open(..., '_blank') で新規タブDL。prospects.length===0時はボタンdisabled |

**クライアント側ロジック（再実装が必要）**

- mount時 Promise.all で3API並列取得。prospectsRes.okのみ致命エラー、他2つはok判定して失敗時フォールバック(空)。cancelledフラグでunmount後のsetStateを防止
- ソート: created_at 降順（新しい順）で固定。filtered useMemo 内で[...prospects].sort後にfilter
- フィルタ(AND結合): search(company_name/domain/subjectの部分一致・小文字化) / filterCompat(compatibility_score完全一致) / filterStatus(send_status一致) / filterService(service_id===Number(filterService))
- serviceNameMap: services配列から Map<id,name> をuseMemo構築。無い場合は '#{service_id}' 表示
- sentCountFor(domain): sentCountsByDomain[domain.toLowerCase().trim()] を引く。0超のときのみ『通算N通』バッジ表示
- scheduledCount useMemo: send_status==='scheduled' 件数。0超のとき予約クイックフィルタボタン表示
- 予約クイックフィルタ: ボタンで filterStatus を 'scheduled' ⇄ '' トグル
- handleStatusChange: PUT成功で prospects をローカルにimmutable更新(該当idのsend_statusのみ差替)。updatingStatusIdでその行のselectをdisable
- handleCancelSchedule: confirm→POST成功で該当行を send_status:'unsent', scheduled_at:null にローカル更新
- handleSuppress: confirm→POST。suppressingDomainで多重押下防止。成功/失敗ともalert通知
- showFilters トグルでフィルタパネル開閉。hasActiveFilters は3フィルタのいずれか有効。clearFiltersで3つ空に
- レスポンシブ2表現: md未満はカードリスト(Link全体が/prospect/{id}へ)、md以上はテーブル
- 日時整形: formatScheduledAt はUTC保存値を 'T'/'Z'補完してローカルja-JP表記。formatDateはISO→ja-JP。truncateで件名/subject省略

**⚠️ 安全/UX 要注意（誤移植＝退行）**

- send-counts のキーは domain を toLowerCase().trim() で正規化して突合している。改修でこの正規化を外すと『通算N通』バッジが出なくなる（既送信の見落とし→重複送信リスク）
- 予約取消・ステータス変更・抑止は成功後にサーバ再取得せずローカルstateをimmutable更新している。UIの真実がローカルに寄るので、この更新を落とすと表示が実態とズレる
- handleCancelSchedule / handleSuppress は confirm() 必須の破壊的操作。confirmを外すと誤操作で予約解除・送信停止が起きる
- 予約取消/抑止ボタンはカード/行のLink内にある。onClickで e.preventDefault() して遷移を止めている（改修で消すと詳細ページへ誤遷移）
- ステータスは STATUS_LABELS/STATUS_STYLES の7値(unsent/scheduled/sent/failed/replied/meeting/rejected)固定。未知値は unsent 表示にフォールバック。値集合を変えるとサーバ契約とズレる
- scheduled_at はUTC保存前提でformatScheduledAtがZ補完している。ローカル前提に変えると予約時刻表示がずれる
- このページには一斉送信ループ・acknowledgedWarnings・危険検知warnings・全選択(チェックボックス選択)は存在しない（それらは別画面）。history側にそれらを『足す』際はサーバ契約が別なので流用不可

**ページ間state（受け渡し）**

- router.push/sessionStorage/URLクエリの使用なし。ページ間遷移は next/link の Link のみ
- Link href=/prospect/{id}（カード全体＝モバイル、行内の詳細ボタン＝デスクトップ両方）
- Link href=/generate（履歴が空のときの『メールを作成する』CTA）
- mount時に読むのは3API(/api/prospects, /api/services, /api/prospects/send-counts)のみ。ローカルstorage読取なし

**UX/IA 要素の棚卸し**

- 見出し『生成履歴』＋件数バッジ(filtered.length)
- 予約クイックフィルタ丸ボタン『📅 予約 N件』(トグル・(表示中)表示)
- CSV出力ボタン(prospects空でdisabled)
- 検索input(企業名・ドメイン・件名)
- フィルターボタン(有効数バッジ付き)＋開閉パネル
- フィルタパネル: 相性(高/中/低) / ステータス(7値) / サービス(services列挙) の3 select ＋ リセットボタン
- エラーバナー / ローディングスピナー / 空状態(履歴なし→『メールを作成する』Link=/generate、条件不一致→別文言)
- モバイル: カードリスト(会社名・相性バッジ・件名・日付・ステータスバッジ・通算通数バッジ・→)
- デスクトップ: テーブル(日付/会社名+通算バッジ/サービス/相性/ステータスselect/件名(⏰予約時刻付き)/操作列)
- 操作列ボタン: 予約取消(scheduled時のみ) / 抑止(Prohibitアイコン) / 詳細Link(→/prospect/{id})
- 行内ステータス変更select(CaretDown付き・更新中disable)

**使用コンポーネント**

- （なし）


### `/prospect/[id]` （745行）

**ファイル**: `C:/tmp/ai-mail-check/app/prospect/[id]/page.tsx`

**役割**: 個別プロスペクト（1社）宛の営業メールをレビュー・編集・送信する画面。企業分析の表示、件名/本文の編集、AI再生成/フォローアップ生成、品質チェック表示、送信元アカウント選択、ステータス管理、単一宛先への送信までを1画面で担う。

**叩くAPI（＝保つべき契約）**

| endpoint | method | いつ |
|---|---|---|
| `/api/prospects/{id}` | GET | mount時（id確定後のuseEffect内でPromise.all）。プロスペクト本体を取得しsubject/body/refusal情報を初期化 |
| `/api/senders` | GET | mount時（同Promise.all）。送信元アカウント一覧を取得、先頭を初期選択 |
| `/api/settings` | GET | mount時（同Promise.all）。config.test_mode==='true' でテストモードバナー制御 |
| `/api/prospects/{id}/regenerate` | POST | 「再生成」ボタン（handleRegenerate）。Prospectを返し件名/本文を差し替え |
| `/api/prospects/{id}` | PUT | 「保存」ボタン（handleSave）およびhandleSend内で送信直前に自動保存。body: {subject, body} |
| `/api/prospects/{id}/status` | PUT | ステータスドロップダウン変更（handleStatusChange）。body: {status}。更新後のProspectを返す |
| `/api/prospects/{id}/followup` | POST | 「フォローアップ」ボタン（handleFollowUp）。{subject, body}を返し本文差し替え |
| `/api/suppressions` | POST | 「送信しないリストに追加」ボタン（handleSuppress）。confirm後。body: {target: domain, target_type:'domain', reason:'manual', note} |
| `/api/templates` | POST | 「テンプレ保存」ボタン（handleSaveTemplate）。prompt名入力後。body: {name, subject, body} |
| `/api/send` | POST | 「送信」ボタン（handleSend）。body: {prospectId, senderId, toEmail, acknowledgedWarnings, includeBookingLink}。409+warnings時に再POST |

**クライアント側ロジック（再実装が必要）**

- mount時ロード: fetch3本(prospect/senders/settings)をPromise.allで並列取得。sendersRes/configResは!okでも空配列/{}にフォールバック（部分失敗を許容）。cancelledフラグでアンマウント時のsetState抑止
- 送信フロー2段階(handleSend): まず handleSave() で編集内容をPUT保存 → postSend(false) を実行 → HTTP 409 かつ data.warnings が配列なら confirm で警告文列挙して人が承認 → postSend(true) で acknowledgedWarnings=true 再送。承認しなければ '送信を中止しました' で中断
- 営業お断りガード: hasRefusal が true の場合、送信直前に confirm（特定電子メール法違反の可能性）を出し、キャンセルなら送信自体を開始しない（warnings承認とは別レイヤーの先行ガード）
- 送信成否判定: res.ok=false 時は data.reasons(配列→改行join) または data.error を sendError に表示。成功時は prospect.send_status を楽観的に 'sent' へ更新し、data.testMode でトーストメッセージ分岐
- 宛先dedup相当: emailsFound は emails_found_json をparse。送信先は常に emailsFound[0]（最新1件/先頭のみ）を toEmail に使用。宛先0件なら送信不可
- 品質チェック再計算(qualityIssues): APIが捨てる品質結果を、純関数 validateEmail(body, subject, analysis, {fromTemplate: !!template_id}) でクライアント再計算。body/subject/analysis変更のたびにuseMemoで追従。ブロックはしない（情報表示のみ）
- 本文文字数カウント(countBodyLength): 本文中の区切り '━━━' 以前の主要テキストのみ trim().length でカウント（署名/フッターを除外）
- JSON安全parse(parseJson): analysis_json / emails_found_json をtry-catchでフォールバック付きparse
- canSend算出: senders.length>0 かつ emailsFound.length>0 かつ currentStatus==='unsent' の三条件AND。送信ボタンのdisabled制御
- 日程調整リンク(includeBookingLink): 既定OFF（1通目に入れると返信率が下がる仕様）。selectedSender.booking_url が無ければチェックボックスdisabled
- showToast: setToast(null)→setTimeout0→setToast(message) で同一メッセージ連続でも再発火させる小技
- モバイルの企業分析カード折りたたみ(showAnalysis): md未満でトグル、md以上は常時表示

**⚠️ 安全/UX 要注意（誤移植＝退行）**

- hasRefusal（営業お断り検出）時の送信前confirmを必ず維持。文言は特定電子メール法違反リスクを明示。省略すると法令違反送信のリスク
- acknowledgedWarnings の2段階フロー（409→confirm→再送）を厳守。1段目は必ず false で投げ、サーバのブロック指摘はここを通らず res.ok=false 側で止まる設計。誤って初手 true にすると危険検知を握り潰す
- 送信可否は currentStatus==='unsent' のみ（canSend）。送信済/予約済/失敗/返信/商談/見送りでは送信ボタンをdisableのまま。作り替え時に条件を緩めると二重送信の退行
- 送信直前の handleSave() 自動保存を省くと、画面編集内容が保存されないまま送信される退行
- テストモードバナー（isTestMode）: 宛先がテストアドレスに強制上書きされる旨の赤バナー。送信成功時 data.testMode でトースト文言も分岐。UI改修で消すと本番/テストの取り違え
- toEmail は emailsFound[0] 固定。複数宛先を一律送信するなど挙動を変えない
- 品質チェック(qualityIssues)と営業お断り警告は『表示するが送信をブロックしない』設計。ブロックする/しないの境界を反転させない
- 送信元アカウントの auth_status!=='connected' 時にオプション末尾へ '[要再認証]' を付す表示を保つ
- 楽観的更新（send_status='sent'）とサーバ応答の不整合に注意。成功パスでのみ更新している

**ページ間state（受け渡し）**

- URLパラメータ: useParams().id でプロスペクトIDを取得。全API呼び出しのキー
- 戻る導線: Link href='/history'（履歴一覧へ）
- フォームを開く: window.open(prospect.form_url, '_blank', 'noopener,noreferrer')
- sessionStorage/router.push は本ページでは未使用（受け渡しはURLの[id]のみ）

**UX/IA 要素の棚卸し**

- バナー: テストモード赤バナー / 営業お断り(amber)警告バナー（refusalText引用付き）
- ヘッダ: 戻る(履歴へ)リンク、会社名/ドメインタイトル、ドメインpill
- ヘッダ右アクション: 『送信しないリストに追加』ボタン、ステータス変更セレクト(pill型・色分け)
- 左カラム: 企業分析カード（会社名/事業概要/提案ポイント/相性スコアバッジ+理由）、モバイルは詳細トグル
- 右カラム: メールカード（件名input / 本文textarea+文字数 / 品質チェックボックス / フォームURL / 宛先リスト / 送信元セレクト+日程調整リンクchk / 送信エラー表示）
- バッジ: 相性スコア(高/中/低・色分け)、is_form_only時『フォーム用文面』、ステータスpill
- モバイル下部アクションバー(4分割): 再生成/コピー/保存/送信
- デスクトップ下部アクションバー: 再生成/フォローアップ/コピー/テンプレ保存/フォームを開く(条件付) + 保存/送信
- モーダル相当: window.confirm（お断り送信・warnings承認・suppress確認）、window.prompt（テンプレ名）

**使用コンポーネント**

- @/components/toast の Toast（message/onDoneでトースト表示）
- @/lib/quality-check の validateEmail（純関数・品質チェック再計算）
- @/lib/types の型 AnalysisResult/Prospect/SendStatus
- @phosphor-icons/react のアイコン群


### `/settings` （737行）

**ファイル**: `C:/tmp/ai-mail-check/app/settings/page.tsx`

**役割**: アプリ全般の設定画面。Gmail送信アカウント接続・日次上限・日程調整URL、外観(テーマ/アクセント)、配信停止受付アドレス、キーワード検索モード(API/スクレイピング)とSerper APIキー、生成デフォルト(サービス/人格)、アクセス保護状態表示とログアウト、生成履歴全削除(危険操作)を1画面で管理する。送信ループやリスト操作は持たず、設定の読み書きに徹する。

**叩くAPI（＝保つべき契約）**

| endpoint | method | いつ |
|---|---|---|
| `/api/settings` | GET | mount時のload()でPromise.all並列取得 |
| `/api/services` | GET | mount時のload()でPromise.all並列取得(デフォルトサービスのselect用) |
| `/api/personas` | GET | mount時のload()でPromise.all並列取得(デフォルト人格のselect用) |
| `/api/senders` | GET | mount時のload()でPromise.all並列取得(接続済Gmailアカウント一覧) |
| `/api/settings` | PUT | handleSaveSender(配信停止アドレス保存ボタン)/handleSaveDefaults(デフォルト設定保存ボタン)/handleSaveSearch(キーワード検索保存ボタン) の3箇所。それぞれ送るキーが異なる部分更新 |
| `/api/senders` | PATCH | handleSaveDailyLimit(日次上限inputのonBlur/Enter)とhandleSaveBookingUrl(日程調整URL inputのonBlur/Enter) |
| `/api/senders` | DELETE | handleDisconnectSender(各アカウントのゴミ箱ボタン、confirm後) |
| `/api/auth/gmail` | GET | handleConnectGmail(Gmailアカウントを接続ボタン)。返却{url}へwindow.location.hrefでリダイレクト |
| `/api/auth/logout` | POST | handleLogout(ログアウトボタン)。成功後/loginへ遷移 |
| `/api/prospects` | DELETE | handleClearHistory(生成履歴をすべて削除ボタン、confirm後)。body={confirm:'DELETE_ALL_PROSPECTS'}、成功後location.reload() |

**クライアント側ロジック（再実装が必要）**

- mount時に/api/settings,/api/services,/api/personas,/api/sendersをPromise.all並列取得し、各resのok判定でフォールバック(settings→{}、配列→[])。cancelledフラグでアンマウント時のsetState抑止
- /api/settingsのPUTは部分更新を3系統に分割: sender_email / (default_service_id+default_persona_id) / (search_mode+serper_api_key)。UI改修でも保存単位を混ぜない
- APIキー(serper_api_key)はサーバから返さない。設定済みかはserper_api_key_configured==='true'で判定し、入力欄は空で保持。保存時のみtrim値を送る
- 日次上限保存(handleSaveDailyLimit): Number.isInteger且つ0以上のバリデーション、現在値と同一なら送信スキップ、成功でローカルstate更新+draft削除、0は無制限メッセージ
- 日程調整URL保存(handleSaveBookingUrl): trim後に空以外は/^https:\/\//iを必須チェック、現在値同一ならスキップ、booking_toolは既存値優先(なければ'calendly')を同送
- limitDrafts/bookingDraftsはid→文字列のRecordで各行のドラフト管理。inputはdraft ?? 実値で表示、onBlur/Enterで確定保存、成功後にdraftエントリをdeleteして実値表示へ戻す
- showToast: 一旦null→setTimeout0で再セットし同一メッセージでも再発火させる
- Gmail接続結果はwindow.location.searchのgmail_success/gmail_errorをmount後に一度だけ読む(useSearchParams非使用の意図的判断、コメント参照)
- theme/accentはuseTheme()コンテキスト経由で即時反映(APIではなくコンテキスト管理)

**⚠️ 安全/UX 要注意（誤移植＝退行）**

- APIキーを画面に絶対表示しない設計(serperApiKeyは常に空初期化、configuredフラグのみ)。UI作り替えで既存キーをvalueに流し込むと漏洩退行
- 日程調整URLのhttps://必須バリデーションを外すとhttp混入
- 日次上限の整数・非負バリデーションを落とすと不正値送信
- 生成履歴削除は{confirm:'DELETE_ALL_PROSPECTS'}マジック文字列と二段confirmが安全弁。文字列を変えると不可逆削除がAPI側で弾かれる/または無防備化
- アカウント切断・履歴削除はwindow.confirmで二重確認。これを省くと誤操作で不可逆
- authEnabled===falseの『誰でもアクセス可能』警告バナー、authPasswordWeakの短パスワード警告は必ず残す(セキュリティ告知)
- Gmail接続エラーはGMAIL_ERROR_MESSAGESで既知コードを日本語化、未知コードはコード名フォールバック表示。invalid_state等のメッセージを落とさない
- sender.auth_status==='connected'以外は『要再認証』を赤系表示で明示。状態バッジを退行させない
- 保存ボタンのdisabled条件(savingSender||draft===現在値 等)で二重送信・無変更保存を防止

**ページ間state（受け渡し）**

- mount時にwindow.location.searchのgmail_success/gmail_errorクエリを読み、接続結果バナーに反映(OAuthコールバック→/settings?gmail_success=true 等の遷移前提)
- handleConnectGmail: /api/auth/gmailの返す{url}へwindow.location.hrefで外部OAuthへ遷移
- handleLogout: 成功後window.location.href='/login'
- handleClearHistory: 成功後window.location.reload()
- sessionStorage/router.pushによるページ間受け渡しは本ファイルには無し(URLクエリとフルリダイレクトのみ)

**UX/IA 要素の棚卸し**

- 左右2カラムグリッド(lg:2col)構成
- 上部警告バナー: 認証未設定(danger)・弱パスワード(warning)・Gmail接続成功(success)・Gmail接続失敗(danger)の4種
- セクション(カード): Gmail接続 / 外観 / アクセス(ログアウト) / データ管理(危険ゾーン) / 配信停止受付アドレス / キーワード検索 / デフォルト設定
- Gmail接続: アカウント行ごとに接続状態アイコン(緑/赤)・メール・状態テキスト(接続中/要再認証・上限なし)・日次上限number input(通/日)・切断ゴミ箱ボタン・日程調整URL input、下部に『Gmailアカウントを接続』ボタン
- 外観: テーマ3択(ライト/ダーク/システム)トグルボタン、アクセントカラーのスウォッチ選択(選択時チェック+リング)
- キーワード検索: API/スクレイピングの2択トグル、APIモード時のみSerper APIキーpassword入力欄と説明文、scrapeモード時は注意書き
- デフォルト設定: サービス/人格のselect(未設定option付き)+保存ボタン
- 保存ボタン各所: 通常/保存中スピナー/保存済みチェックの3状態表示
- 主要ボタン: 保存(sender/search/defaults)、Gmail接続、ログアウト、生成履歴削除、アカウント切断

**使用コンポーネント**

- Toast (@/components/toast) — message/onDoneで下部トースト表示
- useTheme・ACCENT_COLORS (@/lib/theme-context) — テーマ/アクセントの状態管理コンテキスト
- @phosphor-icons/react アイコン群(EnvelopeSimple,FloppyDisk,GoogleLogo,Moon,Sun,Monitor,SpinnerGap,Check,Trash,PlugsConnected,Warning)


### `/settings/personas` （551行）

**ファイル**: `C:/tmp/ai-mail-check/app/settings/personas/page.tsx`

**役割**: 営業メールの送信者となる「人格(Persona)」のCRUD管理画面。基本情報(名前/役職/性別/年代/会社名/署名ブロック)と5つの性格パラメータ(論理性/熱量/丁寧さ/営業感/文章量、各1-5)を登録・編集・削除する設定ページ。送信ループやdedup等の危険ロジックはこのページには存在しない。

**叩くAPI（＝保つべき契約）**

| endpoint | method | いつ |
|---|---|---|
| `/api/personas` | GET | mount時(useEffectのloadPersonas、cancelledフラグ付き)＋保存/削除後の再取得(fetchPersonas)。人格一覧を取得しpersonasにセット |
| `/api/personas` | POST | 新規登録フォーム送信時(editingId===null)。bodyはPersonaInput全体のJSON |
| `/api/personas/{id}` | PUT | 編集フォーム送信時(editingId!==null)。パスにpersona.id、bodyはPersonaInput全体のJSON |
| `/api/personas/{id}` | DELETE | 各カードの削除ボタン→window.confirm承認後。成功後fetchPersonasで再取得 |

**クライアント側ロジック（再実装が必要）**

- 新規/編集の分岐: editingId(number|null)で判定。editingId===null→POST /api/personas、それ以外→PUT /api/personas/{editingId}(handleSubmit内でendpoint/methodを切替)
- 編集時のフォーム初期化: openEditFormでpersonaの11フィールド(name/title/gender/age_range/company_name/signature_block/logic/passion/politeness/salesiness/length)をformにコピー
- 新規時のフォーム初期化: openCreateFormでEMPTY_FORMを設定(age_range既定=20代、5パラメータ既定=3)
- クライアント側バリデーション: handleSubmitでform.name.trim()とform.title.trim()が空なら『必須項目を入力してください。』を出しfetchせず中断
- パラメータ更新: updateParam(key,value)でform内の該当ParamKeyのみ不変更新(prev spread)
- 保存/削除成功後に必ずfetchPersonas()で一覧を再取得(楽観更新はしない)
- エラーハンドリング: 保存失敗時はレスポンスJSONのdata.errorを優先しformErrorに表示、削除失敗時はlistErrorに表示
- saving中は保存ボタンをdisabled+スピナー表示
- 5パラメータ(logic/passion/politeness/salesiness/length)はrange input(min1/max5/step1)。カード側は5セグメントのバー表示(n<=値でopacity1、それ以外0.15)

**⚠️ 安全/UX 要注意（誤移植＝退行）**

- 削除は必ずwindow.confirm(`「${name}」を削除しますか？`)で確認してから実行。この確認を落とすと誤削除で人格データが消える
- APIの契約: POSTは/api/personas、更新はPUT /api/personas/{id}、削除はDELETE /api/personas/{id}。UI改修でmethod/パス/bodyのPersonaInput全フィールド(11個)を欠落させると保存が壊れる
- PersonaInputの5パラメータは1-5のnumber。range→Number()変換を落とすと文字列送信で退行
- editingIdの状態管理(create=null/edit=id)を取り違えると新規登録が既存を上書きする危険
- 保存/削除後のfetchPersonas再取得を落とすと画面が古い一覧のまま残る

**ページ間state（受け渡し）**

- （なし）

**UX/IA 要素の棚卸し**

- ヘッダ右上『新規登録』ボタン(Plusアイコン)
- 一覧空時のEmptyState(『人格が登録されていません』＋新規登録ボタン)
- 人格カード(2カラムグリッド md:grid-cols-2): アバター(名前頭文字・グラデ背景)、名前、役職/会社名、編集ボタン(PencilSimple)、削除ボタン(Trash)、5パラメータのバー表示
- インラインの登録/編集フォーム(showFormでトグル、モーダルではなくページ内展開・animate-fade-in): 基本情報セクション(名前/役職/性別select/年代select/会社名/署名block textarea)＋性格パラメータセクション(5本のrangeスライダー、min/maxラベル・現在値バッジ)
- エラーバナー(listError=一覧上部、formError=フォーム内、Warningアイコン付き)
- loading中『読み込み中...』テキスト
- 保存ボタン(saving時スピナー・『保存中...』)＋キャンセルボタン

**使用コンポーネント**

- @phosphor-icons/react のアイコンのみ(CaretDown/PencilSimple/Plus/SpinnerGap/Trash/User/Warning)。components/配下の共通コンポーネントは未使用(EmptyState/PersonaFormは同ファイル内ローカル定義)
- 型: @/lib/types の Persona, PersonaInput


### `/settings/services` （618行）

**ファイル**: `C:/tmp/ai-mail-check/app/settings/services/page.tsx`

**役割**: 営業メールの元になる「サービス(商材)」マスタのCRUD画面。カード一覧＋新規/編集フォーム（インライン展開）で、名前・説明・強み・ターゲット・LP URLを管理。加えて仕様書/企画書のテキスト貼付けまたはファイル(PDF/MD/TXT)アップロードをAIで解析しフォームへ自動入力する補助機能を持つ。

**叩くAPI（＝保つべき契約）**

| endpoint | method | いつ |
|---|---|---|
| `/api/services` | GET | mount時(useEffectでloadServices)＋作成/更新/削除の各成功後にfetchServices()で再取得 |
| `/api/services` | POST | 新規登録時のフォーム送信(editingIdがnull)。body=ServiceInput(JSON) |
| `/api/services/{editingId}` | PUT | 編集時のフォーム送信(editingIdあり)。body=ServiceInput(JSON) |
| `/api/services/{service.id}` | DELETE | 削除ボタン→window.confirm承認後 |
| `/api/services/parse-file` | POST | 解析ボタン押下時にselectedFileがある場合。FormData(file)で送信(Content-Type自動) |
| `/api/services/parse` | POST | 解析ボタン押下時にファイル未選択でspecTextがある場合。body={text}(JSON) |

**クライアント側ロジック（再実装が必要）**

- ※このページには送信の直列ループ・各宛先最新1件のdedup・acknowledgedWarnings・予約日時・重複バッジは存在しない（それらは送信系ページの機能でありservices画面には無い）

**⚠️ 安全/UX 要注意（誤移植＝退行）**

- 削除は必ずwindow.confirm(『「名前」を削除しますか？』)で確認してから DELETE。確認UIを外すと誤削除に直結
- 保存前の必須4項目(name/description/strengths/target)クライアントバリデーションを保持しないと空データがPOST/PUTされる
- applyResultの『空なら既存値を維持』ロジック(|| form.xxx)を単純上書きに変えると、AI解析が一部フィールドを空返ししたとき既存入力を消してしまう退行
- 編集時にlp_urlが未設定(null)でも service.lp_url ?? "" で空文字化しており、これを外すとcontrolled inputがnullでwarning/クラッシュ
- ファイル検証(5MB上限・拡張子/MIMEホワイトリスト)を落とすと不正/過大ファイルがparse-fileへ送られる
- editingIdの有無でPOST(新規)とPUT(更新)を切替。この分岐を誤ると新規のつもりで別レコード更新、または重複作成の退行

**ページ間state（受け渡し）**

- （なし）

**UX/IA 要素の棚卸し**

- 主要ボタン: 『新規登録』(ヘッダ右／空状態内の2箇所, openCreateForm)
- カード内アクション: 編集(PencilSimple, aria-label=編集)・削除(Trash, aria-label=削除)アイコンボタン
- インライン展開フォーム(モーダルではなくshowFormでカード上部に差し込み, animate-fade-in)。ヘッダは編集/新規で文言分岐
- フォーム内: 左カラム=手入力(サービス名/説明/強み/ターゲット/LP URL)＋保存/キャンセル、右カラム=仕様書自動入力パネル
- 自動入力パネル: ドラッグ&ドロップ or クリックのファイルゾーン、『または』区切り、直接入力textarea、『解析してフォームに反映』ボタン(解析中スピナー)
- 一覧: 空状態(EmptyState, Briefcaseアイコン＋案内文＋新規登録ボタン)／読み込み中(『読み込み中...』)／カードグリッド(1〜2カラム)
- カードの視覚要素: 頭文字グラデーションアバター、名前、説明(40/80字truncate)、強みを『、,-』で分割し先頭3件をタグ表示、ターゲットを成功色バッジで表示
- エラー表示: 一覧取得/削除エラー(上部の赤警告ボックス)、フォーム保存エラー(フォーム内赤ボックス)、解析エラー(パネル内赤テキスト)。いずれもWarningアイコン付き
- 保存ボタンのsaving中は『保存中...』＋スピナー＋disabled、解析ボタンも同様のローディング状態

**使用コンポーネント**

- （なし）


### `/settings/templates` （580行）

**ファイル**: `C:/tmp/ai-mail-check/app/settings/templates/page.tsx`

**役割**: 営業メールのテンプレート（名前・件名・本文・マーカー・添付資料の許可/紐付け）を一覧・作成・編集・削除する設定画面。左に一覧、右に編集パネルの2カラム構成。

**叩くAPI（＝保つべき契約）**

| endpoint | method | いつ |
|---|---|---|
| `/api/templates` | GET | mount時（useEffect）に /api/attachments と Promise.all で並列取得し一覧を初期化 |
| `/api/attachments` | GET | mount時（useEffect）に /api/templates と Promise.all で並列取得し資料ライブラリを初期化 |
| `/api/attachments` | POST | 資料ピッカーの「新しい資料をアップロード」でファイル選択時。FormData(file)で送信 |
| `/api/attachments/{id}` | DELETE | 資料一覧の各行のゴミ箱ボタン（confirm確認後）。ライブラリから完全削除 |
| `/api/templates` | POST | 新規作成モードで「保存」ボタン押下時。作成後に続けて紐付けPUTを呼ぶ |
| `/api/templates/{id}` | PUT | 既存編集モードで「保存」ボタン押下時。更新後に続けて紐付けPUTを呼ぶ |
| `/api/templates/{id}` | DELETE | 一覧カードの削除ボタン（confirm確認後） |
| `/api/templates/{id}/attachments` | PUT | 保存フロー内で必ず（作成/更新の直後）。body={attachmentIds: editAttachmentIds}。順序付きの資料紐付けを保存し、更新後のattachments配列を返す |

**クライアント側ロジック（再実装が必要）**

- 保存の2段直列: POST/PUT /api/templates → 返ってきたidで PUT /api/templates/{id}/attachments を必ず続けて呼び、両方成功で state 反映。片方失敗は catch でトースト表示（部分更新の可能性あり）
- hybrid互換マイグレーション migrateHybridBody(): compose_mode==='hybrid' かつ fixed_part がある古いテンプレは編集時に fixed_part + '\n\n{{AI:ai_brief}}' に合成して本文欄に展開（DB上は hybrid でも UI では単一本文として編集）
- 保存時は常に compose_mode='fixed_only' 固定、fixed_part='' / ai_brief='' を送る（editComposeMode は set 関数を持たない固定値）。UI改修でもこの固定値送信を維持しないと旧hybrid経路が壊れる
- allow_attachments は UI boolean → 送信時 1/0 に変換
- 本文カーソル挿入 insertAtCursor(): textareaのselectionStart/Endに文字列を挿入。{{AI:}}は cursorBack=2 で : と }} の間にカーソルを戻す。requestAnimationFrameでfocus+選択位置復元
- selectedAttachments は useMemo で editAttachmentIds の順序（ライブラリ順ではなくユーザー選択順）で library から解決。この順序が /attachments PUT にそのまま渡り送信順になる
- toggleAttachment(): 紐付けID配列のトグル（含めば除外・なければ末尾追加）
- 資料ライブラリ削除 handleDeleteFromLibrary(): DELETE成功後に library・editAttachmentIds・全templatesのattachmentsから当該idを除去（クライアント側で全テンプレの参照を一括除去）
- アップロード成功時: library先頭にunshift かつ 現在編集中の editAttachmentIds に自動追加
- handleCopy(): navigator.clipboard に `件名\n\n本文` を書き込み
- showToast(): 一旦null→setTimeout(0)で再セットし連続表示でも再アニメさせる
- 編集/作成/キャンセルの状態機械: editingId(null=新規) と creating フラグで isEditing を導出。startEdit/startCreate/cancelEdit で pickerOpen もリセット

**⚠️ 安全/UX 要注意（誤移植＝退行）**

- allow_attachments（F22ガード）: OFFのテンプレは添付セクションがpointer-events-none opacity-40で操作不可。『初回メールに資料添付しない』方針を構造的に守る仕掛け。UI改修でこの無効化・注意書きを落とすと誤添付事故に直結
- 保存は必ず2段（テンプレ本体 + attachments紐付けPUT）。紐付けPUTを省くと添付が保存されない退行
- compose_mode は常に fixed_only 固定送信。migrateHybridBody と対で、旧hybridテンプレを壊さず単一本文に一本化している。この暗黙の変換を外すと旧データが破損
- 資料ライブラリ削除は全テンプレから外れる破壊的操作（confirmメッセージで明示）。DELETE後のクライアント側一括除去（templates全走査）を維持しないと表示が実態とズレる
- {{AI:}} / {{変数}} マーカーの説明文と挿入ボタンはエンジン契約そのもの（本文中のマーカーをサーバが解釈）。マーカー文字列・{{AI:}}のcursorBack=2挙動を変えないこと
- 添付の並び順（選択順）が送信順として意味を持つため、selectedAttachmentsのuseMemo順序ロジックを保持

**ページ間state（受け渡し）**

- なし（このページは router.push/sessionStorage/URLクエリを一切使わない自己完結型。mount時に読むのは /api/templates と /api/attachments のみ）
- 参考: 空状態の案内文に『メール詳細画面の「テンプレ保存」から追加できます』とあり、別画面からのテンプレ生成導線が存在することを示唆（このページ内には実装なし）

**UX/IA 要素の棚卸し**

- 右上『新規作成』ボタン（編集中はdisabled）
- テンプレ件数バッジ（0件時非表示）
- 左: テンプレ一覧カード（クリック/Enter/Spaceで編集、選択中はprimaryリング）
- カード内: 名前・件名(なければ『件名なし』)・更新日時・添付数バッジ(Paperclip)
- カードのコピー/削除ボタン（stopPropagationで親クリック抑止）
- 空状態プレースホルダ（BookmarkSimple + 案内文）
- 右: 編集パネル（sticky、ヘッダに新規/編集ラベルと×閉じる）
- 入力: テンプレート名・件名(input)、本文(textarea 12行 monospace)
- マーカー挿入ボタン群: {{company_name}} {{person_name}} {{sender_name}} {{service_name}} {{lp_url}} と {{AI:}}（琥珀色・MagicWand）
- 本文下の使い方説明ブロック
- allow_attachments チェックボックス+方針注意書き
- 添付資料セクション（allow_attachments連動で有効/無効グレーアウト、『資料を選ぶ』トグル）
- 選択済み添付リスト（各行に×外すボタン、なければ『添付なし』）
- 資料ピッカー（pickerOpen）: アップロードボタン+ライブラリ一覧（チェックボックス選択・ゴミ箱削除・対応形式/10MB注記・max-h-52スクロール）
- 保存ボタン（フル幅・saving中スピナー）
- Toast通知

**使用コンポーネント**

- Toast (@/components/toast)
- @phosphor-icons/react のアイコン群（BookmarkSimple, Copy, MagicWand, Paperclip, Plus, SpinnerGap, Trash, UploadSimple, X, Check, FloppyDisk）
- 型: Attachment, ComposeMode, Template, TemplateWithAttachments (@/lib/types)


### `/settings/suppressions` （332行）

**ファイル**: `C:/tmp/ai-mail-check/app/settings/suppressions/page.tsx`

**役割**: 「送信しないリスト」(サプレッション/配信停止)の管理画面。ここに登録した宛先(メールアドレス or ドメイン全体)には、どの経路からも送信できなくなる。特定電子メール法の停止依頼対応の法令遵守面を担う。宛先の手動追加・一覧表示・検索・削除ができる。

**叩くAPI（＝保つべき契約）**

| endpoint | method | いつ |
|---|---|---|
| `/api/suppressions` | GET | mount時(useEffect)に一覧を取得。res.okでなければ空配列 |
| `/api/suppressions` | POST | 追加フォーム送信(handleAdd)。body={target, target_type, reason, note}。返り値の Suppression を先頭に追加(同id除外でdedup) |
| `/api/suppressions` | DELETE | 各行のゴミ箱ボタン(handleDelete)。confirm承諾後にbody={id}で削除 |

**クライアント側ロジック（再実装が必要）**

- 検索フィルタ: search文字列(trim+lowercase)で items を target と note の部分一致でフィルタ(useMemo)。空クエリなら全件
- POST成功後の楽観更新+dedup: setItems((prev)=>[data, ...prev.filter(s=>s.id!==data.id)]) で新規を先頭に挿入しつつ同idの旧レコードを除外
- DELETE成功後: prev.filter(s=>s.id!==item.id) でローカルから除去
- 手動登録の理由選択肢を SELECTABLE_REASONS=['optout','rejected_reply','manual'] に限定(自動でしか付かない bounce / refusal_detected はselectに出さない)
- 対象タイプ切替(email/domain)のセグメントトグル。domain時はplaceholderと注記(全アドレス対象)を切替
- 二重送信ガード: saving中 または target空 なら handleAdd を即return、送信ボタンもdisabled
- Toast: showToast()で一旦null→setTimeout(0)で再セットし同一メッセージでも再発火させる
- formatDate: ISO文字列を ja-JP ロケールで整形、無効日付は元文字列を返す

**⚠️ 安全/UX 要注意（誤移植＝退行）**

- これは法令遵守(特定電子メール法)機能。登録宛先は『どの経路からも送信できなくなる』ため、追加/削除の確実性を落とさない
- DELETEは必ず confirm() で『外すと再び送信できるようになる』旨を警告してから実行。この確認を外すと誤解除で違法送信リスク
- POST時の同idフィルタによるdedupを維持しないと一覧に重複行が出る
- 理由selectを SELECTABLE_REASONS に絞る制約を維持(自動理由 bounce/refusal_detected をユーザーが手動選択できないようにする)
- 警告バナー(特定電子メール法/自動登録の説明)は法的注意喚起なので削らない
- REASON_LABELS/REASON_STYLES に無い reason が来た場合のフォールバック(?? s.reason / ?? '')を保持

**ページ間state（受け渡し）**

- なし(sessionStorage/router.push/URLクエリの受け渡しは一切使っていない。mount時に読むのは /api/suppressions のみ)

**UX/IA 要素の棚卸し**

- 検索入力(アドレス・メモで検索、右上)
- 対象タイプのセグメントトグル(メールアドレス/ドメイン全体)
- 理由セレクト(手動登録可能な3種)
- メモ入力(任意)
- 『リストに追加』送信ボタン(saving中はスピナー+『登録中...』)
- 登録済み件数バッジ(items.length)
- 一覧テーブル(対象/理由/メモ/登録日時/削除)
- 理由バッジ(色分けREASON_STYLES)
- ドメイン全体バッジ(target_type==='domain'時)
- 各行の削除(ゴミ箱)ボタン
- 空状態(未登録 vs 検索該当なしで文言分岐)
- ローディング時の全画面スピナー
- 警告バナー(Warningアイコン付き)

**使用コンポーネント**

- Toast (@/components/toast) — message/onDone props
- @phosphor-icons/react のアイコン(MagnifyingGlass, Plus, Prohibit, SpinnerGap, Trash, Warning)
- 型: Suppression, SuppressionReason, SuppressionTargetType (@/lib/types)


### `/login` （96行）

**ファイル**: `C:/tmp/ai-mail-check/app/login/page.tsx`

**役割**: パスワード1つで認証するログイン画面。認証成功後に元々アクセスしようとしたページ(next)へ戻す。ミドルウェア等で未認証時に飛ばされてくる入口。

**叩くAPI（＝保つべき契約）**

| endpoint | method | いつ |
|---|---|---|
| `/api/auth/login` | POST | フォーム送信(handleSubmit)時。bodyは{ password } のJSON。res.ok なら遷移、!ok なら data.error を表示 |

**クライアント側ロジック（再実装が必要）**

- 二重送信ガード: submitting が true の間は handleSubmit を即return、ボタンも disabled
- 認証成功後の遷移: router.replace(readNextPath()) → router.refresh() の順で呼ぶ。replace(pushでなく)で履歴に残さない、refreshでサーバコンポーネント再取得
- readNextPath(): window.location.search から next クエリを読み、オープンリダイレクト防止として '/' 始まり かつ '//' 始まりでない同一サイト絶対パスのみ許可、それ以外は '/' にフォールバック
- エラー処理: res.ok=false 時は data.error(無ければ既定文言)、fetch例外時は固定文言をセット。finally で submitting を必ず false に戻す

**⚠️ 安全/UX 要注意（誤移植＝退行）**

- useSearchParams() を意図的に使っていない — 使うとページ全体がサーバ描画を放棄し、JS未読込時に真っ白になる本番障害が過去に発生。next は送信時に location から一度だけ読む設計を崩さないこと
- オープンリダイレクト防止のホワイトリスト検証(readNextPath の startsWith('/') && !startsWith('//'))を必ず維持。緩めると外部サイトへの誘導が可能になる
- router.replace + router.refresh のペアを維持。refresh を落とすと認証後にサーバ側の再取得が走らずログイン状態がUIに反映されない恐れ
- submitting によるボタン disabled と早期returnの二重送信防止を維持

**ページ間state（受け渡し）**

- URLクエリ next を読取(mount時ではなく送信時に window.location.search から)。認証後の戻り先。未指定/不正時は '/'
- router.replace(next) で遷移、router.refresh() でサーバ状態を更新

**UX/IA 要素の棚卸し**

- パスワード入力欄(type=password, autoFocus, autoComplete=current-password)
- エラーメッセージ表示領域(danger色バナー、error時のみ)
- ログインボタン(submitting中は SpinnerGap 回転+『確認中...』、通常は『ログイン』)
- ボタンの活性条件: submitting でない かつ password が非空
- ヘッダー: LockSimpleアイコン+『SalesMail』タイトル+説明文

**使用コンポーネント**

- （なし）


### `NAV/IA shell (app root + /collection/* + /settings/*)`

**ファイル**: `C:/tmp/ai-mail-check/components/tab-nav.tsx, C:/tmp/ai-mail-check/app/layout.tsx, C:/tmp/ai-mail-check/app/collection/layout.tsx, C:/tmp/ai-mail-check/app/settings/layout.tsx`

**役割**: アプリ全体のナビ・IA骨格。RootLayout がテーマ適用スクリプト+NavHeader+main枠を提供し、collection/settings 各 layout が TabNav でサブタブ（ルート分割型）を出す。機能ロジックは一切持たず、URLルートで画面を切り替える純プレゼンテーション層。

**叩くAPI（＝保つべき契約）**

- （なし）

**クライアント側ロジック（再実装が必要）**

- TabNav のアクティブ判定: items の href を走査し pathname===href または pathname.startsWith(`${href}/`) にマッチする中で「最も長い href」を activeHref とする reduce ロジック。索引ルート(/settings, /collection)が子ルート(/settings/templates 等)を誤って拾わないための最長一致。UI改修時もこの最長一致規則を維持しないとタブのアクティブ表示が誤る。
- RootLayout head 内インライン themeScript: localStorage 'theme'(dark/light/未設定→OSのprefers-color-scheme)で data-theme/colorScheme/dark class を初期描画前に設定し、localStorage 'accent' の値でアクセントカラー配色(blue/indigo/violet/rose/orange/emerald/teal/slate の4色配列)を CSS変数 --primary/--primary-hover/--primary-light に適用する。FOUC回避のため body描画前に同期実行が必須。

**⚠️ 安全/UX 要注意（誤移植＝退行）**

- IA構造は「画面内state切替」ではなく「ルート分割」で意図設計されている（tab-nav.tsx コメント: 個別タブのブックマーク/共有/戻るボタンを保つため）。UI改修でタブをSPA的なstate切替に作り替えると、ブックマーク・共有・戻る挙動が退行する。
- collection/layout.tsx コメント明記: CSV取込は「その送信の宛先を読み込む」機能なので一括送信側に残す設計。収集タブへ移すと一括送信で宛先を選べなくなる退行が起きる。IA再編時に移動してはいけない。
- /settings 単体は「全般」として生きているが、ナビからは /settings/templates を指す（最頻用のため）。最長一致ロジックがあるので /settings タブは子ルート閲覧時にアクティブにならない。この2重の扱いを崩さないこと。
- themeScript の accent 配色マップ(8色×4値)とCSS変数名(--primary/--primary-hover/--primary-light)はテーマ機構の契約。改修で変数名や配色を落とすとテーマ/アクセント設定が無効化する。

**ページ間state（受け渡し）**

- localStorage 'theme' (dark/light) — RootLayout themeScript が mount前に読取り data-theme に反映
- localStorage 'accent' (blue/indigo/violet/rose/orange/emerald/teal/slate) — 同スクリプトが CSS変数に反映
- ページ間状態受け渡し(sessionStorage/router.push/URLクエリ)はこのNAV/IA層には無し。ルート遷移は Link の href のみ（TABS 定義の静的パス）。

**UX/IA 要素の棚卸し**

- フィルタ・モーダル・バッジ・送信フロー等の機能UXはこの層に無し（レイアウト/タブのみ）。棚卸し対象の実体は各ページファイル側。

**使用コンポーネント**

- @/components/tab-nav の TabNav（items: TabItem[]{href,label,Icon}, title を受ける汎用サブタブ）
- next/link の Link, next/navigation の usePathname
- @phosphor-icons/react アイコン群 (Stack/MagnifyingGlass/Buildings, BookmarkSimple/Briefcase/GearSix/Prohibit/UserCircle)
- @/lib/theme-context の ThemeProvider
- ./nav-header の NavHeader
- next/font/google の Geist / Geist_Mono フォント変数
