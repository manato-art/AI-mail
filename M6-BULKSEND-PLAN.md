# M6 実装手順書 — /bulk-send（一括送信）の新デザイン移行

> 2026-07-25 Fable 作成（実コード 2,613 行を全読した上での分解）。M6 実装ワーカーはこの手順書と UI-OVERHAUL-MAP.md `/bulk-send` 節・IA-DESIGN.md §4.2 を正本とする。
> 原則: **ロジックは「移動」するだけで「書き換え」ない**。state・handler・文言は現行のまま、置き場所と見た目だけ変える。

## 0. 現行コードの構造（実測）

- 単一ファイル `app/bulk-send/page.tsx`（2,613行）。state 約40個・handler 約25個
- **重要な現行仕様（設計書§4.2と整合済み）**: フッターは `hasGenerated` で二段切替 — 未生成時=「選択したN件を生成」ボタン、生成後=予約datetime＋「選択したN件を送信/予約」。`要確認の指摘があっても送信する` チェックは hasGenerated 時のみ表示
- 直接入力の編集UIは右パネル内（`inputMode==='direct'` 時）。変数チップ6種＋AIチップ（cursorBack=2）
- 右パネル3状態: hasGenerated=生成結果編集 ／ direct=メール作成＋差し込みプレビュー ／ template=送信プレビュー（{{AI:}}を【AIが会社ごとに書く部分】に置換表示）
- モーダル4つ: 履歴／企業一覧／取込（paste/csv+列マッピング）／**生成済みメール送信**（今回タブへ昇格する対象）

## 1. ファイル分割（第1段: 見た目を変えないリファクタ）

`page.tsx` に **全 state と全 handler を残し**、JSX だけを props 受けの表示部品へ切り出す:

| 新ファイル（app/bulk-send/ui/） | 中身（現行行番号目安） |
|---|---|
| recipient-table.tsx | 宛先テーブル＋行状態＋hoverプレビュー＋4追加ボタン（1286-1509） |
| right-panel.tsx | 右パネル3状態（1511-1801） |
| send-footer.tsx | フッター（1804-1892）→ 第2段で下部固定バー化 |
| import-modal.tsx | 取込モーダル（2164-2354） |
| history-modal.tsx | 履歴モーダル（1894-2009） |
| companies-modal.tsx | 企業一覧モーダル（2011-2162） |
| generated-panel.tsx | 生成済み送信（2357-2607）→ 第3段でモーダル→タブ化 |

- 分割は **コピー移動のみ**（1文字も書き換えない。props はコールバック/値の受け渡しだけ）
- 第1段完了時点で `npm run smoke` 70/70 全緑を確認してから第2段へ（見た目不変なので必ず通る。通らなければ分割ミス）

## 2. 新レイアウト（第2段: IA-DESIGN §4.2）

- 上部にモード2タブ「テンプレで一斉送信」（**default**）／「生成済みメールを送る（N件バッジ=genSelectable.length）」。同一ルート内の UI 状態。既存の破線ボタン（1172-1182）はタブに置き換え
- テンプレ側 = 3ステップ縦セクション:
  - **①だれに送る** = recipient-table（常時展開）
  - **②なにを送る** = 現行の「入力モード切替（テンプレ/直接入力）＋テンプレselect＋F22添付まわり＋右パネル」を1セクションに再配置（2カラム: 左=選択/入力、右=プレビュー）
  - **③だれから送る** = 送信元 select（要再認証表示そのまま）
  - **②③は recipients.length===0 の間は折りたたみ**（1件以上で自動展開・手動開閉可・折りたたみ中も DOM には置く=状態を失わない）
- **下部固定送信バー**（sticky bottom・現行フッターの中身をそのまま移設）: 選択N/M件 ＋ 要確認チェック（hasGenerated時のみ・**直下に説明1行**「会社ごとの内容になっていない可能性のある宛先があります。内容を確認してからチェックしてください」＝新規文言・平易）＋ 中断 ＋ 生成ボタン(N/N進捗) or 予約datetime＋送信/予約ボタン。hasGenerated による二段切替ロジックは**現行のまま**
- 警告バナー（Gmail未接続/テンプレ0件/テストモード/F22注意書き）は該当セクションの文脈位置へ。文言不変
- **モード2タブ「生成済みメールを送る」** = generated-panel を全幅表示（モーダルの中身を Modal ラッパーなしで描画）。検索/フィルタ2select/すべて選択(送信可能N件)/行(バッジ・内容・引用)/フッター（予約datetime＋「予約送信/テスト送信/選択を各社へ送信」）を**完全温存**。`generatedOpen` state はタブ選択に読み替え（タブを開いた時に既定選択 useEffect を発火＝現行のモーダルopen時と同じ）

## 3. 絶対に落とさない移植チェックリスト（実コード実測・ワーカーは✓報告必須）

1. sessionStorage `bulk-send-recipients` 復元→`recipientsHydrated` 後のみ書込・0件で remove（424-466）
2. `bulk-send-import` は読んだら**即 removeItem**（消費一回・checked:true で追加）（435-452）
3. beforeunload 警告 = isSending || recipients>0（468-475）
4. `handleTemplateChange`: 添付Set・generatedEmails・rowStatus を必ず破棄（491-498）
5. 送信ループ: 宛先ごと `/api/bulk-send` POST（body 形状 729-740 と同一）・**300ms 間隔**・`cancelRef` は現在の1件を送り終えてから停止・stoppedAt 集計トースト（659-779）
6. 重複除外(#7): email 小文字 key・先頭のみ送信・スキップ行の文言「同一メールアドレスが重複しているためスキップしました（先頭の1件のみ送信）」**一言一句不変**・confirm に（重複 N件は除外）注記（669-708）
7. confirm 文言3系統×2フロー（テンプレ側 704-708 / 生成側 243-247）**一言一句不変**
8. 予約: 過去日時ガード（toast で中止）・テンプレ側は宛先ごと `scheduledAt` 同送・**生成側の予約はサーバ一括 `/api/prospects/bulk-schedule`**（フロント直列にしない=离脱でも全件予約）・失敗分だけ選択に残す `setGeneratedChecked(failed ids)`（250-302）
9. 生成(#5): `/api/bulk-send/preview` 宛先ごと直列・`cancelGenerateRef`・**warnings を generatedEmails に保持し編集パネルで表示**（786-851, 1537-1547）
10. `allowWarnings` を 3 API すべてに伝播（/api/bulk-send・/api/send・/api/prospects/bulk-schedule）・既定 false
11. 生成済み側: `firstEmailOf`＝emails_found_json の先頭1件／`genSelectable`＝宛先メールごと最新1件・sent/scheduled 除外／`isOlderDup` バッジ／タブを開いた時に selectable を既定選択（918-968）
12. 送信成功時の prospects ローカル更新（send_status: sent/scheduled）と genRowStatus 状態機械（304-352）
13. F22: allow_attachments=false のテンプレでは添付UI自体を出さない＋案内文（1236-1245）。取込の lp_url 列→ `/api/companies` POST source:'csv_import'（620-639）
14. 取込: xlsx はサーバパース `/api/import/parse`（FormData）・列マッピング5種・email 必須・既存宛先との小文字重複スキップ・truncated トースト（555-648）
15. 直接入力: 変数チップ6種＋{{AI:}}チップ cursorBack=2・placeholder 文言不変（1664-1691）
16. 右パネルのプレビュー: `resolveEmailVariables` によるクライアント解決・未解決変数表示・「社名の文字列置換はしない」設計コメント維持（506-522）
17. hover 300ms の行内送信プレビュー（1345-1447）※モバイルでは元々発火しない。維持
18. モーダル/タブの空状態・loading・全選択のフィルタ後対象限定（各モーダル現行どおり）

## 4. テスト影響（IA-DESIGN §6-6 のみ許可）

- bulk-send 系 spec（D5-D8/D13/D14）の「生成済みモーダルを開く」手順: 破線ボタン click → **タブ「生成済みメールを送る」click** に更新。**それ以外のセレクタ・ネットワーク契約アサートは不変**（内部の文言・ボタン名は全温存されるため）
- C5（宛先永続）/C3（検索→受け渡し）/D9 等は無変更で通ること（sessionStorage 契約不変の証明）
- 絵文字入りの既存バッジ文言（⏰予約・📨送信済み等）は **M6 では触らない**（anti-ai-look の掃除は M7 で §6 追記の上で判断）

## 5. 実装順（コミット3つ・各段で smoke 全緑）

1. `refactor(ui): bulk-send を表示部品に分割（挙動・見た目不変）` → smoke 70/70
2. `feat(ui): bulk-send 新レイアウト（3ステップ+下部固定バー+モードタブ）` → smoke（この段では旧モーダル経路も生かしたまま）→ 必要なら微修正
3. `feat(ui): 生成済み送信をタブへ昇格 + bulk-send spec の開閉手順更新（§6-6）` → smoke 70/70
- attribution 禁止・push 禁止・各段でスクショ（1440/390×ライト/ダーク、タブ両モード）

## 6. 認知チェック（実装後の自己レビュー）

- 初見で「①宛先→②内容→③送信元→下の青ボタン」の順路が数字で追えるか
- 生成前に送信ボタンが出ない（現行仕様の可視化）ことが混乱を生まないか — 生成ボタンに「→ 生成すると送信ボタンが現れます」の補助文1行（新規文言・平易）
- 要確認チェックの説明1行が表示されているか
