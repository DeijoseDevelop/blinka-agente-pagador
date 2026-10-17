import Decimal from "decimal.js";

/**
 * Configuracion global de precision monetaria.
 * Se usa Decimal (decimal.js) en TODO el pipeline; nunca flotantes nativos ni bigint.
 */
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP, toExpPos: 40, toExpNeg: -40 });

export { Decimal };

/** Numero de decimales de un importe monetario (centavos). */
export const MONEY_SCALE = 2;

/**
 * Redondeo CONSERVADOR hacia arriba al centavo.
 * Se aplica en conversiones FX y en cualquier normalizacion monetaria de frontera.
 */
export function roundCeilCent(value: Decimal.Value): Decimal {
  return new Decimal(value).toDecimalPlaces(MONEY_SCALE, Decimal.ROUND_CEIL);
}

/**
 * Importe monetario inmutable. Encapsula un Decimal exacto + su divisa ISO 4217.
 * Todas las operaciones preservan la divisa salvo conversion explicita.
 */
export class Money {
  readonly amount: Decimal;
  readonly currency: string;

  private constructor(amount: Decimal, currency: string) {
    this.amount = amount;
    this.currency = currency;
  }

  static of(amount: Decimal.Value, currency: string): Money {
    return new Money(new Decimal(amount), currency);
  }

  private assertSame(other: Money): void {
    if (this.currency !== other.currency) {
      throw new MoneyCurrencyError(this.currency, other.currency);
    }
  }

  add(other: Money): Money {
    this.assertSame(other);
    return new Money(this.amount.add(other.amount), this.currency);
  }

  sub(other: Money): Money {
    this.assertSame(other);
    return new Money(this.amount.sub(other.amount), this.currency);
  }

  mul(factor: Decimal.Value): Money {
    return new Money(this.amount.mul(factor), this.currency);
  }

  cmp(other: Money): number {
    this.assertSame(other);
    return this.amount.cmp(other.amount);
  }

  eq(other: Money): boolean {
    return this.cmp(other) === 0;
  }
  gt(other: Money): boolean {
    return this.cmp(other) > 0;
  }
  /** Comparacion inclusiva: >= limite. */
  gte(other: Money): boolean {
    return this.cmp(other) >= 0;
  }
  lt(other: Money): boolean {
    return this.cmp(other) < 0;
  }
  /** Comparacion inclusiva: <= limite. */
  lte(other: Money): boolean {
    return this.cmp(other) <= 0;
  }

  isZero(): boolean {
    return this.amount.isZero();
  }

  isNegative(): boolean {
    return this.amount.isNegative();
  }

  /** Normaliza hacia arriba al centavo (conservador). */
  roundCeilCent(): Money {
    return new Money(roundCeilCent(this.amount), this.currency);
  }

  /**
   * Convierte a otra divisa usando una tasa fija.
   * El resultado se redondea HACIA ARRIBA al centavo (criterio conservador).
   */
  convertTo(targetCurrency: string, rate: Decimal.Value): Money {
    const converted = this.amount.mul(new Decimal(rate)).toDecimalPlaces(MONEY_SCALE, Decimal.ROUND_CEIL);
    return new Money(converted, targetCurrency);
  }

  /** Serializacion estable con 2 decimales, apta para firmar y comparar. */
  toFixed(): string {
    return this.amount.toDecimalPlaces(MONEY_SCALE, Decimal.ROUND_HALF_UP).toFixed(MONEY_SCALE);
  }

  toString(): string {
    return this.toFixed();
  }

  toJSON(): string {
    return this.toFixed();
  }
}

export class MoneyCurrencyError extends Error {
  constructor(a: string, b: string) {
    super(`Monedas incompatibles: ${a} vs ${b}`);
    this.name = "MoneyCurrencyError";
  }
}

/**
 * Convierte un importe a la divisa base usando la tabla FX.
 * Redondeo ROUND_CEIL obligatorio. Si no hay tasa, falla (fail-closed -> UNKNOWN aguas arriba).
 */
export function convertToBase(
  money: Money,
  baseCurrency: string,
  rate: Decimal.Value
): Money {
  if (money.currency === baseCurrency) {
    return money.roundCeilCent();
  }
  return money.convertTo(baseCurrency, rate);
}
