export type Language = "en" | "es";

export class LanguageService {
  private static readonly SPANISH_HINTS = [
    " que ", " los ", " las ", " el ", " la ", " un ", " una ", " de ", " y ",
    "agente", "codigo", "código", "sesion", "sesión", "explica", "explicar",
  ];

  private static readonly ENGLISH_HINTS = [
    " the ", " and ", " with ", " for ", "what", "agent", "code", "session", "explain",
  ];

  /**
   * Detects the language based on input text.
   */
  public static detectLanguage(input: string): Language {
    const lowered = input.toLowerCase();
    const esScore = this.SPANISH_HINTS.filter((hint) => lowered.includes(hint)).length;
    const enScore = this.ENGLISH_HINTS.filter((hint) => lowered.includes(hint)).length;

    return enScore >= esScore ? "en" : "es";
  }

  /**
   * Translates or picks the appropriate text based on the detected language.
   */
  public static translate<T>(lang: Language, translations: Record<Language, T>): T {
    return translations[lang];
  }
}
