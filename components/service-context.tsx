"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import type { Service } from "@/lib/types";

/**
 * 「いま何の商材の作業をしているか」を全画面で共有する箱。
 *
 * ここが持つのは *画面の初期表示*（フィルタ・selectの初期値）だけで、
 * APIへ送る値を裏で書き換えることは絶対にしない。
 * 送信・重複・送信しないリストの安全判定は全商材共通のまま（IA-DESIGN §3.4）。
 *
 * 既定は「すべての商材」＝現行と完全に同じ挙動。
 */

/** localStorage キー（新規。theme / accent など既存キーには一切触らない） */
const STORAGE_KEY = "active-service";

/** 「すべての商材」を表す保存値 */
const ALL_VALUE = "all";

interface ServiceContextValue {
  /** 選択中の商材ID。null = すべての商材 */
  activeServiceId: number | null;
  setActiveServiceId: (id: number | null) => void;
  /** 選択肢に出す商材一覧。取得できなければ空配列のまま（UIを出さないだけ） */
  services: Service[];
}

const ServiceContext = createContext<ServiceContextValue>({
  activeServiceId: null,
  setActiveServiceId: () => {},
  services: [],
});

export function useActiveService() {
  return useContext(ServiceContext);
}

export function ServiceProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [services, setServices] = useState<Service[]>([]);
  const [activeServiceId, setActiveState] = useState<number | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    // localStorage はブラウザ専用。遅延初期化するとサーバ描画と食い違うため、
    // マウント後に一度だけ読む（theme-context と同じ方針）
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      stored = null;
    }
    if (!stored || stored === ALL_VALUE) return;
    const id = Number(stored);
    if (!Number.isInteger(id) || id <= 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveState(id);
  }, []);

  useEffect(() => {
    // ログイン前は保護APIを叩かない。取得は1回だけ（画面遷移で叩き直さない）
    // 中断フラグは持たない。StrictMode の二重実行で「1回目の取得を2回目の
    // クリーンアップが取り消して永遠に出ない」事故を避けるため（ref で1回に絞る）
    if (pathname === "/login" || fetchedRef.current) return;
    fetchedRef.current = true;
    fetch("/api/services")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (Array.isArray(data)) setServices(data as Service[]);
      })
      .catch(() => {
        // 取れなければ商材スイッチャーを出さないだけ。ナビ本体は絶対に壊さない
      });
  }, [pathname]);

  const setActiveServiceId = useCallback((id: number | null) => {
    setActiveState(id);
    try {
      localStorage.setItem(STORAGE_KEY, id === null ? ALL_VALUE : String(id));
    } catch {
      // プライベートモード等で保存できなくても、その場の選択は効かせる
    }
  }, []);

  const value = useMemo(
    () => ({ activeServiceId, setActiveServiceId, services }),
    [activeServiceId, setActiveServiceId, services]
  );

  return <ServiceContext value={value}>{children}</ServiceContext>;
}
