/**
 * どの商材でメールを作るかを決める（2026-08-06 追加）。
 *
 * ★ なぜ切り出したか（実際に起きた事故）:
 *   一括送信の画面で商材「かってにHP」を選び、テンプレートも「かってにHP」を選んだのに、
 *   生成された本文に **「きっかけ！インターン」（採用支援）** の話が出た。
 *
 *   原因は単純で、**画面で選んだ商材が API に渡っていなかった**。
 *   API 側は `settings.default_service_id` を見て、無ければ
 *   `getAllServices()[0]`＝**登録順の1件目**を黙って使っていた。
 *   画面の商材フィルタは宛先の絞り込みにしか効いていなかった。
 *
 *   「選んだのに違うものが使われる」は、気づけないまま顧客に届く型の壊れ方
 *   （KB silent-failure-cascade）。だから **明示指定が来たのに解決できなかったら、
 *   既定に落とさずエラーにする**。黙って別の商材で書くより、作れない方が良い。
 */

export interface PickServiceResult<T> {
  service: T | undefined;
  /** 明示指定が解決できなかった場合の理由。呼び出し側はこれがあれば 4xx を返す */
  error?: string;
}

export function pickService<T>(
  requestedId: number | undefined | null,
  defaultId: number | undefined | null,
  getById: (id: number) => T | undefined,
  all: () => T[]
): PickServiceResult<T> {
  // 1. 画面で明示的に選ばれた商材が最優先
  if (typeof requestedId === "number" && Number.isInteger(requestedId) && requestedId > 0) {
    const found = getById(requestedId);
    if (found) return { service: found };
    // ★ 既定に落とさない。選んだものと違う商材で本文を書くのが今回の事故そのもの
    return { service: undefined, error: `指定された商材（id=${requestedId}）が見つかりません` };
  }

  // 2. 設定の既定値
  if (typeof defaultId === "number" && Number.isInteger(defaultId) && defaultId > 0) {
    const found = getById(defaultId);
    if (found) return { service: found };
  }

  // 3. 登録順の先頭（従来の挙動。商材が1つしか無い運用のため残す）
  return { service: all()[0] };
}
