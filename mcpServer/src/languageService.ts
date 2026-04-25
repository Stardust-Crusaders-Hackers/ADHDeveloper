export type Language = "en" | "es" | "ca" | "fr" | "pt" | "zh" | "ja" | "ru" | "de";

export class LanguageService {
  private static readonly HINTS: Record<Language, string[]> = {
    en: [" the ", " and ", " with ", " for ", "what", "agent", "code", "session", "explain"],
    es: [" que ", " los ", " las ", " el ", " la ", " un ", " una ", " de ", " y ", "agente", "codigo", "código", "sesion", "sesión", "explica", "explicar"],
    ca: [" que ", " els ", " les ", " el ", " la ", " un ", " una ", " de ", " i ", "agent", "codi", "sessió", "explica"],
    fr: [" que ", " les ", " le ", " la ", " un ", " une ", " de ", " et ", "agent", "code", "session", "explique"],
    pt: [" que ", " os ", " as ", " o ", " a ", " um ", " uma ", " de ", " e ", "agente", "codigo", "código", "sessão", "explica"],
    de: [" der ", " die ", " das ", " und ", " mit ", " für ", "agent", "code", "sitzung", "erkläre"],
    zh: ["的", "和", "与", "为", "代理", "代码", "会话", "解释"],
    ja: ["の", "と", "に", "で", "エージェント", "コード", "セッション", "説明"],
    ru: [" и ", " в ", " на ", " для ", "агент", "код", "сессия", "объяснить"],
  };

  /**
   * Detects the language based on input text.
   */
  public static detectLanguage(input: string): Language {
    const lowered = input.toLowerCase();
    let bestLang: Language = "en";
    let maxScore = -1;

    for (const [lang, hints] of Object.entries(this.HINTS)) {
      const score = hints.filter((hint) => lowered.includes(hint)).length;
      if (score > maxScore) {
        maxScore = score;
        bestLang = lang as Language;
      }
    }

    // Default to English if no strong signal
    return maxScore > 0 ? bestLang : "en";
  }

  /**
   * Translates or picks the appropriate text based on the detected language.
   */
  public static translate<T>(lang: Language, translations: Record<string, T>): T {
    return (translations[lang] || translations["en"]) as T;
  }
}
