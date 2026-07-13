import type { Persona } from "@/lib/types";

const LOGIC_TEXT: Record<number, string> = {
  1: "感情や共感を重視し、相手の気持ちに寄り添う表現を多く使う。データや論理的根拠よりも、想いや共感の言葉で伝える。",
  2: "共感ベースの文体で、必要に応じて簡単な理由を添える程度。",
  3: "共感と論理のバランスを取る。理由は述べるが、堅くなりすぎない。",
  4: "論理的に構成し、提案の理由やメリットを明確に述べる。",
  5: "極めてロジカルに構成し、具体的なデータや根拠を提示して提案する。感情表現は最小限に。",
};

const PASSION_TEXT: Record<number, string> = {
  1: "淡々と簡潔に事実を述べる。感嘆や意欲表現は使わない。",
  2: "落ち着いたトーンで、控えめに関心を示す程度。",
  3: "適度な意欲を示す。「ぜひ」を1回程度使ってよい。",
  4: "前向きな意欲を明確に示す。「ぜひ一度」「大変興味深く」等の表現を自然に使う。",
  5: "ぜひ一度、と前のめりな意欲表現を入れる。ただし感嘆符は本文全体で1個まで。熱意が伝わる文体にする。",
};

const POLITENESS_TEXT: Record<number, string> = {
  1: "ビジネス敬語は維持しつつ、できるだけ簡潔でフランクな表現にする。過度な敬語は避ける。ただしタメ口は絶対禁止。",
  2: "標準的なビジネス敬語。必要最低限の敬語で簡潔に。",
  3: "標準的なビジネスメールの敬語レベル。",
  4: "丁寧なビジネス敬語を使う。相手への敬意を十分に示す表現を選ぶ。",
  5: "最上級の敬語表現を使う。「〜いただけますと幸いです」「〜賜れますと幸いに存じます」等、最敬体で書く。",
};

const SALESINESS_TEXT: Record<number, string> = {
  1: "売り込み感を極力排除し、相談・情報提供のスタンスで書く。「もしご興味があれば」程度の控えめな表現。",
  2: "控えめな提案スタイル。「ご参考になれば」「お役に立てる部分があるかもしれません」等。",
  3: "提案はするが押しすぎない。メリットを述べつつ、判断は相手に委ねる姿勢。",
  4: "明確に提案し、具体的なメリットを伝える。商談への意欲を示す。",
  5: "ストレートに営業提案する。自社サービスの価値を明確に主張し、商談を強く求める。",
};

const LENGTH_TEXT: Record<number, string> = {
  1: "本文は200字前後の極めて簡潔な文章にする。",
  2: "本文は250字前後の簡潔な文章にする。",
  3: "本文は300字前後を目安にする。",
  4: "本文は350字前後で、やや詳しく説明する。",
  5: "本文は400字前後で、丁寧に詳しく説明する。ただし450字は超えない。",
};

function clampLevel(value: number): number {
  return Math.min(5, Math.max(1, Math.round(value)));
}

export function buildPersonaPrompt(persona: Persona): string {
  const logicText = LOGIC_TEXT[clampLevel(persona.logic)];
  const passionText = PASSION_TEXT[clampLevel(persona.passion)];
  const politenessText = POLITENESS_TEXT[clampLevel(persona.politeness)];
  const salesinessText = SALESINESS_TEXT[clampLevel(persona.salesiness)];
  const lengthText = LENGTH_TEXT[clampLevel(persona.length)];

  const identityLines = [
    `あなたは${persona.name}（${persona.company_name} ${persona.title}）として営業メールを書きます。`,
  ];

  if (persona.gender) {
    identityLines.push(`性別: ${persona.gender}`);
  }
  if (persona.age_range) {
    identityLines.push(`年代: ${persona.age_range}`);
  }

  const styleLines = [
    "【文体指示】",
    `・論理性: ${logicText}`,
    `・熱量: ${passionText}`,
    `・丁寧さ: ${politenessText}`,
    `・営業感: ${salesinessText}`,
    `・文章量: ${lengthText}`,
  ];

  return [...identityLines, "", ...styleLines].join("\n");
}
