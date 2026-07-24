# AI-mail スモークテスト計画 ＝「起こりうる不具合を先に予測して潰す」台帳

> **目的**: IA/UI/UX 大改修で **今動いている機能が壊れる**のを防ぐ。
> そのために「改修で起こりうる不具合」を**先に全部予測**し、各々を**機械で検知するテスト**に落とす。
> このファイルが予測台帳（＝改修時のQAチェックリスト）、`tests/smoke/*.spec.ts` がその自動化。
>
> 相棒ドキュメント: `UI-OVERHAUL-MAP.md`（各画面のAPI契約と⚠️安全点）。本書はそれを「壊れ方」の視点で組み替えたもの。

---

## 0. 前提（このテストが安全に回る理由）

| 項目 | 担保 |
|---|---|
| **実送信ゼロ・課金ゼロ** | 外部を叩くAPI（`/api/generate` `/api/send` `/api/bulk-send` `/api/bulk-send/preview` `/api/keyword-search/*` `/api/prospects/bulk-schedule`）は**ブラウザ側で intercept** し、canned（作り物）応答を返す。本物のGmail/Claude/Serperには**一切到達しない**。 |
| **本番DBに触らない** | `DATABASE_DIR=<一時ディレクトリ>` で隔離した使い捨てSQLiteを seed して使う。本番 `data/sales-mail.db` は読まない・書かない。 |
| **収集が勝手に走らない** | `COLLECTION_SCHEDULE_DISABLED=1` でアプリ内スケジューラを停止して起動。 |
| **認証は実物を通す** | `APP_PASSWORD` を設定して起動 → `proxy.ts` の本物の認証を通し、テストは一度ログインして Cookie を取得。 |
| **現行UIで緑** | まず**今のUI**で全テストが緑になることを確認（＝テスト自体が正しい基準線）。改修後に**同じテストを流して緑なら「壊れていない」証拠**、赤なら退行箇所が一発で分かる。 |

**💬 ざっくり**: このテストは「本物のメールを送らず・本物のデータを触らず・課金もせず」に、画面のボタンや流れが正しく動くかだけを機械でチェックします。今のUIで全部○になるのを確認しておき、作り替えた後に同じチェックを流して×が出たら、そこが壊れた場所です。

---

## 1. 「壊れない」と言える構造（2層の網）

```
┌─ エンジン層(lib/ + app/api) ──────────── 触らない ──────────┐
│  verify-*.mts 30本(約261ケース) + tsc + build              │  ← 既存。改修で触らなければ緑のまま＝機能不変の客観証拠
└──────────────────────────────────────────────────────────┘
┌─ UI層(app/**/page.tsx + components) ──── 作り替える ────────┐
│  tests/smoke/*.spec.ts (本計画)                            │  ← 新規。作り替えたUIが「同じ契約で・同じ流れで」動くかを検証
└──────────────────────────────────────────────────────────┘
```

- **エンジンを凍結**すれば、致命的事故（誤送信・二重送信・危険文面ブロック等の**判定そのもの**）はサーバが守る＝UIがどう変わっても揺るがない。これは verify-*.mts が保証。
- 本計画のスモークは、**UIがそのエンジンを正しく呼び・正しく反応するか**（＝作り替えで退行しうる唯一の層）を検証する。

---

## 2. 不具合予測カタログ（カテゴリ別・全網羅）

重大度: 🔴致命(誤/二重/無断/違法送信・データ損失・情報漏洩) / 🟠重(機能不能・白画面) / 🟡中(表示・UX退行)
検知: **auto**=Playwright自動 / **engine**=既存verify-*.mts / **check**=手動チェックリスト（自動化困難）

### A. 認証・アクセス保護（proxy.ts の退行）
| ID | 予測される不具合 | 重大度 | 検知 |
|---|---|---|---|
| A1 | 未ログインで保護ページに入れてしまう（proxyの経路取りこぼし） | 🔴 | auto `S-AUTH-1` |
| A2 | 未ログインAPIが401でなくHTMLを返す（fetchが壊れる） | 🟠 | auto `S-AUTH-2` |
| A3 | ログイン画面自体が真っ白（`useSearchParams`混入でSSR放棄） | 🔴 | auto `S-AUTH-3` |
| A4 | ログイン後の戻り先で外部URLへ飛ぶ（オープンリダイレクト） | 🔴 | auto `S-AUTH-4` |
| A5 | 静的アセット(_next/js/css)が認証で弾かれ全画面白 | 🟠 | auto `S-RENDER-*`が兼ねる |

### B. 画面クラッシュ / 真っ白（render / hydration）
| ID | 予測される不具合 | 重大度 | 検知 |
|---|---|---|---|
| B1 | いずれかの画面が描画時にJS例外→真っ白（1API失敗のフォールバック欠落 等） | 🔴 | auto `S-RENDER-1..14`（全ルート） |
| B2 | hydration mismatch / console error 多発（theme script・key警告等） | 🟡 | auto `S-RENDER-*`（consoleエラー0を検証） |
| B3 | controlled input に null 流し込みでクラッシュ（services lp_url 等） | 🟠 | auto `S-SET-*` / check |

### C. ナビ・IA・ページ間state
| ID | 予測される不具合 | 重大度 | 検知 |
|---|---|---|---|
| C1 | ナビのリンク先ルートが変わり目的の画面に着かない | 🟠 | auto `S-NAV-1` |
| C2 | タブのアクティブ判定（最長一致）が壊れ、子ルートで親タブが光る/どれも光らない | 🟡 | auto `S-NAV-2` |
| C3 | `sessionStorage` 受け渡し破壊: 検索/企業一覧→一括送信の宛先が渡らない | 🟠 | auto `S-NAV-3` |
| C4 | `batch-generate-company-ids` 破壊: 企業一覧→生成(まとめて)が空になる | 🟠 | auto `S-NAV-4` |
| C5 | `bulk-send-recipients` 永続破壊: リロードで宛先リストが消える | 🟡 | auto `S-NAV-5` |
| C6 | テーマ/アクセント localStorage 契約破壊（CSS変数名/配色マップ） | 🟡 | check |
| C7 | 低相性時 `/generate?url=` のURL引き継ぎ欠落（encodeURIComponent） | 🟡 | auto `S-GEN-4` |

### D. 送信の安全レバー（🔴の本丸：誤/二重/無断/違法送信）
| ID | 予測される不具合 | 重大度 | 検知 |
|---|---|---|---|
| D1 | **生成フラグ欠落/true化**: `/api/generate` に `force:false`/`forceLow:false` を送らず重複・低相性ガードを勝手にバイパス | 🔴 | auto `S-GEN-1` engine |
| D2 | **警告承知の2段階破壊**: 初手 `acknowledgedWarnings:true` で危険検知を握り潰す（本来 false→409→人が承認→再送） | 🔴 | auto `S-SEND-1` |
| D3 | **お断りガード欠落**: `hasRefusal` 時の送信前confirm（特電法違反リスク）を出さずに送る | 🔴 | auto `S-SEND-2` |
| D4 | **送信可否条件の緩み**: `canSend` の `status==='unsent'` を外し送信済/予約済に再送＝二重送信 | 🔴 | auto `S-SEND-3` |
| D5 | **一括: 送信済/予約済の除外欠落**: `send_status==='sent'||'scheduled'` を選択対象から外さず二重送信 | 🔴 | auto `S-BULK-1` |
| D6 | **一括: 同一メール重複除外欠落**(#7): 同一宛先へ複数送信 | 🔴 | auto `S-BULK-2` |
| D7 | **一括: 各宛先"最新1件"dedup欠落**: 古い本文を送る | 🟠 | auto `S-BULK-3` |
| D8 | **一括: acknowledgedWarnings 伝播漏れ/既定true化**: 未承知で送る | 🔴 | auto `S-BULK-4` |
| D9 | **汎用文警告(#5)の表示欠落**: 生成本文はサーバ側`{{AI:}}`ゲートが不発→UI表示が唯一の防波堤。落とすと無警告で汎用文が飛ぶ | 🔴 | auto `S-BULK-5` |
| D10 | **テストモード誤認**: テスト中バッジ/確認文言を落とし本番送信と取り違え | 🔴 | auto `S-SEND-4` `S-BULK-6` |
| D11 | **toEmail が emailsFound[0] 固定でなくなる**: 意図しない宛先に送る | 🟠 | auto `S-SEND-5` |
| D12 | **送信直前の自動保存欠落**: 編集内容が保存されないまま古い本文で送信 | 🟠 | auto `S-SEND-6` |
| D13 | **予約日時の未来必須バリデーション欠落**: 過去時刻で予約 | 🟡 | auto `S-BULK-7` |
| D14 | **確認ダイアログ欠落**: 件数/送信元/重複除外数/予約時刻を出さず即送信 | 🟠 | auto `S-BULK-8` |
| D15 | **未解決 `{{変数}}` のまま送信**（サーバは弾くがUIが握り潰すと事故報告が消える） | 🔴 | engine `verify-guard` + auto `S-BULK-*` |

### E. 生成フローの分岐（応答4種のルーティング）
| ID | 予測される不具合 | 重大度 | 検知 |
|---|---|---|---|
| E1 | 成功時に `/prospect/{id}` へ遷移しない | 🟠 | auto `S-GEN-2` |
| E2 | duplicate を「重複」扱いせず再生成（既存 `/prospect/{existingId}` へ飛ばない） | 🟠 | auto `S-GEN-3` |
| E3 | lowCompatibility を警告なく生成（`/generate?url=` へ誘導しない） | 🟠 | auto `S-GEN-4` |
| E4 | error 応答を握り潰し「予期しない応答」で黙る/白画面 | 🟡 | auto `S-GEN-5` |
| E5 | 疑似進捗タイマーの `clearTimeout`（成功/失敗/unmount）欠落でstatus上書き・leak | 🟡 | check |

### F. 収集エンジンの操作面
| ID | 予測される不具合 | 重大度 | 検知 |
|---|---|---|---|
| F1 | 有効判定 `is_active===1 && !paused_kind` を `is_active` だけにし、ブロック中を「収集対象」と誤表示 | 🟠 | auto `S-COL-1` |
| F2 | 自動停止(blocked)からの復帰が `action:'resume'` でなく通常トグルになり再開不能 | 🟠 | auto `S-COL-2` |
| F3 | `hasActiveSources` ガード欠落で有効ソース0でも収集APIを叩ける | 🟡 | auto `S-COL-3` |
| F4 | keyword欄のURL誤入力ガード（正規表現2種）欠落で永久0件ソース量産 | 🟡 | auto `S-COL-4` |
| F5 | `hasWantedlySource` の出し分け欠落で wantedly_direct 重複登録 | 🟡 | check |
| F6 | 削除confirm（「収集済み企業は残る」注記）欠落で誤削除 | 🟡 | auto `S-COL-5` |
| F7 | 在庫僅少/自動停止バナーの表示条件欠落で営業停止に気づけない | 🟡 | check |

### G. リスト / フィルタ / バッジ / カウント
| ID | 予測される不具合 | 重大度 | 検知 |
|---|---|---|---|
| G1 | 送信済み判定のドメイン正規化 `normGenDomain` 欠落で送信済み検知が全滅 | 🟠 | auto `S-LIST-1` engine `verify-gen-status` |
| G2 | history のフィルタ/ソート/予約チップが機能しない | 🟡 | auto `S-LIST-2` |
| G3 | companies の hp_url 無し行が選択・生成対象に混入（二重ガード欠落） | 🟠 | auto `S-LIST-3` |
| G4 | 生成状態フィルタ（未生成/生成済/送信済）の優先順位崩れで状態誤表示 | 🟡 | auto `S-LIST-4` engine `verify-gen-status` |
| G5 | search: 送信済み企業の初期未チェック/除外フィルタ欠落で重複送信候補 | 🟠 | auto `S-LIST-5` |
| G6 | search: メール未検出3分岐（有/フォームのみ/未検出）を誤表示しフォームのみを送信可能と誤認 | 🟡 | auto `S-LIST-6` |

### H. 設定CRUD（personas / services / templates / suppressions）
| ID | 予測される不具合 | 重大度 | 検知 |
|---|---|---|---|
| H1 | 新規(POST)/編集(PUT+id) の分岐取り違えで**新規のつもりが既存を上書き** | 🟠 | auto `S-SET-1` |
| H2 | 削除confirm欠落で誤削除（personas/services/templates/suppressions/senders/履歴全削除） | 🟠 | auto `S-SET-2` |
| H3 | 必須バリデーション欠落で空データ保存 | 🟡 | auto `S-SET-3` |
| H4 | **F22添付ガード欠落**: `allow_attachments=false` テンプレで添付欄が操作可能になり誤添付→サーバ422全滅 | 🔴 | auto `S-SET-4` |
| H5 | templates `compose_mode='fixed_only'` 固定送信＋hybrid合成の暗黙変換が壊れ旧データ破損 | 🟠 | check engine `verify-template-compose` |
| H6 | 添付の並び順（選択順＝送信順）が壊れる | 🟡 | check |
| H7 | 履歴全削除のマジック文字列 `DELETE_ALL_PROSPECTS` 変更で不可逆削除が無防備化/弾かれる | 🟠 | check |

### I. データ / 機密（漏洩・不可逆）
| ID | 予測される不具合 | 重大度 | 検知 |
|---|---|---|---|
| I1 | **APIキー(Serper)を画面に流し込み**→漏洩（本来 configured フラグのみ、value は空） | 🔴 | auto `S-SEC-1` |
| I2 | OAuthトークン/APIキーがHTML・APIレスポンス・ログに露出 | 🔴 | auto `S-SEC-2` check |
| I3 | 外部APIのエラー詳細をUIにそのまま露出（内部情報漏洩） | 🟡 | check |
| I4 | suppressions の理由選択肢に自動理由(bounce/refusal)を出してしまう | 🟡 | auto `S-SET-5` |

### J. テスト基盤自体の失敗モード（メタ）
| ID | 予測される不具合 | 重大度 | 検知 |
|---|---|---|---|
| J1 | intercept 漏れで**本物のGmail/Claudeに到達**（＝テストが送信する事故） | 🔴 | 全 send/generate specで intercept を**必須化**、未intercept時は即fail するガードを共通fixtureに置く |
| J2 | テストDBでなく本番DBを掴む | 🔴 | 起動env `DATABASE_DIR` を一時dir固定、seedはそのdirにのみ書く |
| J3 | 改修でDOMが変わりテストが**偽赤**（挙動は正しいのにセレクタで落ちる） | 🟡 | 主要な断定は**ネットワーク契約**（endpoint/method/body）に寄せる。UI駆動は role/可視テキストで最小限に。改修側に「保つべき契約」を本書で明示 |

---

## 3. 自動化の重点（どこに網の重さを置くか）

改修で**DOMは変わる**ので、DOM構造に依存した断定は偽赤になりやすい。よって自動テストの**証拠の重心は「ネットワーク契約」**に置く：

- 「生成ボタンを押したら `POST /api/generate` が `force:false` 付きで飛ぶ」——これは**画面をどう作り替えても保つべき契約**。intercept でリクエストbodyを直接検査する（DOMに非依存）。
- UIの駆動（URL入力・ボタン押下）は**アクセシブル名／可視の日本語ラベル**で行う（UXラベルは改修でも概ね保たれる）。
- 改修側は本書 §2 の各⚠️と、UI-OVERHAUL-MAP の「保つべきAPI契約」を守る。**ルートURL・APIリクエスト形・主要ラベル**は契約として維持（変える場合はテストのその1点だけ更新）。

**💬 ざっくり**: 画面の見た目は作り替えるので「ボタンの位置」で判定すると誤検知します。だから判定の軸は「ボタンを押したとき裏で正しい命令が正しい中身で飛ぶか」に置きます。ここは見た目を変えても変わらない部分なので、丈夫なテストになります。

---

## 4. 実行方法

```bash
# 1) エンジン不変ゲート（改修で触っていない証拠）
npx tsx scripts/verify-*.mts        # 30本すべて緑であること

# 2) UIスモーク（本計画）
npm run smoke                        # = playwright test（後述のpackage.jsonスクリプト）
```

改修の運用：**改修前に緑を確認 → ページ単位で作り替え → 各ページ改修後に該当specを流す → 全緑で次のページへ**。旧ページは新ページが緑になるまで残す。

---

## 5. カバレッジの正直な限界

- 本スモークは**主要フローと安全レバー**を守る網。ピクセル単位の見た目崩れ・稀なタイミング競合(E5)・localStorage配色(C6)などは**手動チェック(check)**に残る。§2で `check` と記した項目がそれ。
- よって「これで100%バグ無し」ではない。**「致命的な退行(🔴)は機械で捕まえる／細部は目視」**という二段構え。🔴の取りこぼしを無くすことを最優先に設計している。

---

## 6. 実装状況（2026-07-24 時点：現行UIで **全緑**）

`npm run smoke` で走る自動テスト（`tests/smoke/*.spec.ts`）。エンジン層は別途 `npx tsx scripts/verify-*.mts`（30本）。

| spec | カバーする予測ID | 件数 |
|---|---|--:|
| `auth.spec.ts` | A1 A2 A3 A4（+ログイン済み確認） | 5 |
| `render.spec.ts` | B1 B2（全12ルートの白画面/クラッシュ/致命console） | 12 |
| `generate.spec.ts` | D1 / E1 E2 E3 E4 / C7 | 5 |
| `nav.spec.ts` | C1 C2 | 7 |
| `send-safety.spec.ts` | D2 D3 D4 D10 D11 D12 | 5 |
| `bulk-send.spec.ts` | **D5 D6 D7 D8 D13 D14**（生成モーダルの二重送信/除外/dedup/ack/過去予約/確認） | 2 |
| `bulk-send-more.spec.ts` | **C5（宛先リスト永続）D9（直接入力の汎用文警告表示）** | 2 |
| `history.spec.ts` | G2（予約ワンタップ絞り込み） | 1 |
| `handoff.spec.ts` | C4（企業一覧→生成 受け渡し）/ G3（hp_url無し除外） | 2 |
| `templates.spec.ts` | H4（F22添付ガード） | 1 |
| `collection.spec.ts` | F4（キーワード欄URL誤入力ガード） | 2 |
| `collection-sources.spec.ts` | F1（有効判定の複合）F2（resume契約）F3（有効ソース0ガード） | 2 |
| `search.spec.ts` | **G5（送信済み除外）G6（メール未検出3分岐）C3（検索→一括送信受け渡し）** | 3 |
| `theme.spec.ts` | C6（テーマ localStorage/data-theme） | 1 |
| `validation.spec.ts` | H3（人格/サービスの必須バリデーション） | 2 |
| `secrets.spec.ts` | I1（APIキー非表示） | 1 |
| `settings-crud.spec.ts` | H1（新規/編集method）H2（削除confirm） | 3 |
| `destructive.spec.ts` | **H7（履歴全削除のマジック文字列+confirm）SUP-2（抑止リスト削除confirm）** | 2 |
| `suppressions.spec.ts` | **SUP-1（追加契約）I4（理由select限定）** | 2 |
| `settings-actions.spec.ts` | **Gmail接続/ログアウト/日次上限検証/日程URL https検証** | 4 |
| `prospect-actions.spec.ts` | **ステータス変更PUT / 抑止追加confirm** | 2 |
| `history-actions.spec.ts` | **予約取消confirm** | 1 |
| `auth.setup.ts` | ログイン（前提） | 1 |

**🔴致命カテゴリは機械化済み**: 誤/二重/無断/違法送信（D1-D14）・白画面（B1・全12ルート）・認証（A1-A4）・機密漏洩（I1）・F22添付（H4）・汎用文警告表示（D9）・**取り返しのつかない操作の確認ガード（H7/削除confirm全般）**。

**予測カタログ A〜J のうち、自動化できる項目はほぼ全て機械化**（約70ケース）。残るのは下記の「engine担保」か「目視のみ」。

### 残り（もう自動テストしない理由つき）
- **engine テストで担保済み**（UIで二重にやらない）: G1（送信済みドメイン正規化）G4（生成状態優先順）← `verify-gen-status`／未解決変数ブロックD15 ← `verify-guard`／hybrid合成 ← `verify-template-compose`
- **視覚(UI)そのもの**: 作り替えは"意図的に全部変える"ため、スクリーンショット比較は全ページ差分＝ノイズになり不向き。**デザインは目視レビューが正解**（自動化しない）
- **観測しづらい内部**: E5(疑似進捗タイマーのclear内部)・B3(controlled input null 警告)・I2 I3(トークン/エラー詳細の露出の全数)・H6(添付並び順)・F5 F7(wantedly重複追加防止・在庫バナー) — いずれも 🟡以下で、画面の細部やタイミング内部。必要なら追加可能だが費用対効果は低い

> 改修の運用: **改修前に `npm run smoke` で全緑を確認 → ページ単位で作り替え → 都度 `npm run smoke` → 全緑で次へ**。上の「次バッチ」を先に自動化しておくほど、改修時に手で確認する範囲が減る。
