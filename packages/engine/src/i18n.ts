/**
 * Локализация.
 *
 * Каталог Яндекс Игр отдаёт трафик не только из России, и английская версия
 * почти бесплатно расширяет аудиторию: в казуалке текста — пара десятков строк.
 * Язык берётся из SDK (`environment.i18n.lang`), с откатом на язык браузера.
 */

export type Dict = Record<string, string>;

export class I18n<T extends Dict> {
  private lang: string;

  constructor(
    private readonly catalog: Record<string, T>,
    /** Язык, на котором заполнен полный словарь. */
    private readonly fallbackLang: string,
    lang?: string,
  ) {
    this.lang = this.normalize(lang ?? navigator.language);
  }

  private normalize(raw: string): string {
    const short = raw.slice(0, 2).toLowerCase();
    return short in this.catalog ? short : this.fallbackLang;
  }

  setLang(lang: string): void {
    this.lang = this.normalize(lang);
  }

  get current(): string {
    return this.lang;
  }

  /**
   * Возвращает строку по ключу. Пропуски в переводе подставляются из
   * основного языка — незаполненный словарь не должен показывать пустоту.
   */
  t(key: keyof T & string, params?: Record<string, string | number>): string {
    const dict = this.catalog[this.lang];
    const fallback = this.catalog[this.fallbackLang];
    let text = dict?.[key] ?? fallback?.[key] ?? key;

    if (params) {
      for (const [name, value] of Object.entries(params)) {
        text = text.replaceAll(`{${name}}`, String(value));
      }
    }
    return text;
  }

  /** Форматирует число по правилам текущего языка. */
  num(value: number): string {
    return value.toLocaleString(this.lang === 'ru' ? 'ru-RU' : 'en-US');
  }
}
