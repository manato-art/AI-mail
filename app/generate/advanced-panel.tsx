"use client";

import Link from "next/link";
import { CaretDown, Lock, Sliders } from "@phosphor-icons/react";
import type { Template } from "@/lib/types";
import { CARD, LABEL, SELECT, TEXTAREA } from "@/components/ui-kit";

/** トーン・文章量・CTA の選択チップ（押されているものだけアクセント塗り） */
function chipClass(active: boolean) {
  return `inline-flex min-h-11 cursor-pointer items-center rounded-lg border px-3 text-[13px] font-medium transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary) ${
    active
      ? "border-(--color-primary) bg-(--color-primary) text-white"
      : "border-(--color-border) text-(--color-muted) hover:border-(--color-primary) hover:text-(--color-primary)"
  }`;
}

const TONES = [
  { value: "formal", label: "丁寧・堅め" },
  { value: "balanced", label: "バランス" },
  { value: "friendly", label: "親しみやすい" },
] as const;

const LENGTHS = [
  { value: "short", label: "短め（200字）" },
  { value: "standard", label: "標準（300字）" },
  { value: "long", label: "長め（450字）" },
] as const;

const CTAS = [
  { value: "online_meeting", label: "オンライン商談" },
  { value: "phone", label: "電話" },
  { value: "send_materials", label: "資料送付" },
  { value: "seminar", label: "セミナー招待" },
] as const;

interface Props {
  open: boolean;
  onToggle: () => void;
  templates: Template[];
  templateId: string;
  onTemplateId: (v: string) => void;
  tone: string;
  onTone: (v: string) => void;
  length: string;
  onLength: (v: string) => void;
  cta: string;
  onCta: (v: string) => void;
  fixedText: string;
  onFixedText: (v: string) => void;
  additionalInstructions: string;
  onAdditionalInstructions: (v: string) => void;
  disabled: boolean;
}

/**
 * 「詳しい設定」。初期は畳んでおき、初見で見える要素を減らす（IA-DESIGN §5-6）。
 * テンプレートを選んでいる間はトーン・文章量・CTAを出さない
 * （テンプレが文体・長さ・CTAを管理するため。二重制御にすると意図しない文面になる）。
 */
export function AdvancedPanel({
  open,
  onToggle,
  templates,
  templateId,
  onTemplateId,
  tone,
  onTone,
  length,
  onLength,
  cta,
  onCta,
  fixedText,
  onFixedText,
  additionalInstructions,
  onAdditionalInstructions,
  disabled,
}: Props) {
  return (
    <div className={`${CARD} h-fit p-5`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-11 w-full cursor-pointer items-center gap-2 text-left text-[15px] font-semibold transition-colors motion-reduce:transition-none hover:text-(--color-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary)"
      >
        <Sliders size={16} className="shrink-0 text-(--color-primary)" />
        詳しい設定
        <span className="hidden text-[13px] font-normal text-(--color-muted) sm:inline">
          （テンプレート・文体・固定文。触らなくても作れます）
        </span>
        <CaretDown
          size={16}
          weight="bold"
          aria-hidden="true"
          className={`ml-auto shrink-0 text-(--color-muted) transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="mt-4 space-y-4 border-t border-(--color-border) pt-4">
          <div>
            <label className={LABEL} htmlFor="gen-template">テンプレート</label>
            {templates.length > 0 ? (
              <>
                <div className="relative">
                  <select
                    id="gen-template"
                    value={templateId}
                    onChange={(e) => onTemplateId(e.target.value)}
                    disabled={disabled}
                    className={`${SELECT} disabled:opacity-50`}
                  >
                    <option value="">使用しない（自由生成）</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  <CaretDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-(--color-muted)" size={16} weight="bold" />
                </div>
                {templateId && (
                  <p className="mt-1.5 text-[13px] leading-relaxed text-(--color-muted)">
                    テンプレートが文体・長さ・CTAを管理します（トーン等の個別指定は不要）
                  </p>
                )}
              </>
            ) : (
              <p className="text-[13px] text-(--color-muted)">
                テンプレートがありません。
                <Link href="/settings/templates" className="ml-1 font-medium text-(--color-primary) underline underline-offset-2">
                  作成する
                </Link>
              </p>
            )}
          </div>

          {!templateId && (
            <>
              <div>
                <span className={LABEL}>トーン</span>
                <div className="flex flex-wrap gap-2">
                  {TONES.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      aria-pressed={tone === opt.value}
                      onClick={() => onTone(opt.value)}
                      disabled={disabled}
                      className={chipClass(tone === opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className={LABEL}>文章量</span>
                <div className="flex flex-wrap gap-2">
                  {LENGTHS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      aria-pressed={length === opt.value}
                      onClick={() => onLength(opt.value)}
                      disabled={disabled}
                      className={chipClass(length === opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className={LABEL}>行動喚起（CTA）</span>
                <div className="flex flex-wrap gap-2">
                  {CTAS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      aria-pressed={cta === opt.value}
                      onClick={() => onCta(opt.value)}
                      disabled={disabled}
                      className={chipClass(cta === opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div>
            <label className={`${LABEL} flex items-center gap-1.5`} htmlFor="gen-fixed-text">
              <Lock size={13} />
              固定テキスト（任意）
            </label>
            <textarea
              id="gen-fixed-text"
              rows={3}
              value={fixedText}
              onChange={(e) => onFixedText(e.target.value)}
              disabled={disabled}
              placeholder={"全メールにそのまま入る文章を書きます\n例: 弊社は〇〇分野で10年の実績があり…"}
              className={`${TEXTAREA} disabled:opacity-50`}
            />
            {fixedText.trim() && (
              /* AIが触らない契約。編集可能な普通の指示と混同させない */
              <p className="mt-1.5 text-[13px] leading-relaxed text-(--color-muted)">
                この文章はAIが改変せず、全メールにそのまま挿入されます
              </p>
            )}
          </div>

          <div>
            <label className={LABEL} htmlFor="gen-additional">
              追加の指示（任意）
            </label>
            <textarea
              id="gen-additional"
              rows={2}
              value={additionalInstructions}
              onChange={(e) => onAdditionalInstructions(e.target.value)}
              disabled={disabled}
              placeholder="例: 導入事例に触れてほしい、価格には触れないで、など"
              className={`${TEXTAREA} disabled:opacity-50`}
            />
          </div>
        </div>
      )}
    </div>
  );
}
