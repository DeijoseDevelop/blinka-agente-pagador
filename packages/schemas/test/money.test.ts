import { describe, expect, it } from "vitest";
import { Decimal, Money, convertToBase, roundCeilCent } from "../src/index.js";

describe("money (decimal.js)", () => {
  it("redondea hacia arriba al centavo (ROUND_CEIL)", () => {
    expect(roundCeilCent("1.001").toString()).toBe("1.01");
    expect(roundCeilCent("1.000").toString()).toBe("1");
    expect(roundCeilCent("0.025").toString()).toBe("0.03");
  });

  it("convierte a base con redondeo conservador hacia arriba", () => {
    const cop = Money.of(100, "COP");
    const usd = cop.convertTo("USD", "0.00025");
    // 100 * 0.00025 = 0.025 -> CEIL -> 0.03
    expect(usd.toFixed()).toBe("0.03");
  });

  it("usa ROUND_CEIL tambien via convertToBase", () => {
    const usd = convertToBase(Money.of(7000, "COP"), "USD", "0.00025");
    expect(usd.toFixed()).toBe("1.75");
  });

  it("respeta la divisa base sin conversion", () => {
    const usd = convertToBase(Money.of(4750, "USD"), "USD", "1");
    expect(usd.toFixed()).toBe("4750.00");
  });

  it("comparaciones inclusivas: == limite pasa, +1 centavo falla", () => {
    const limit = Money.of(50000, "USD");
    expect(Money.of(50000, "USD").lte(limit)).toBe(true);
    expect(Money.of(50000, "USD").gt(limit)).toBe(false);
    expect(Money.of(50000.01, "USD").gt(limit)).toBe(true);
  });

  it("rechaza operar entre divisas distintas", () => {
    expect(() => Money.of(1, "USD").add(Money.of(1, "COP"))).toThrow();
  });

  it("mantiene precision sin drift de flotante", () => {
    let acc = new Decimal(0);
    for (let i = 0; i < 10; i += 1) acc = acc.add("0.1");
    expect(acc.toString()).toBe("1");
  });
});
