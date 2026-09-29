import { expect, test } from "bun:test";
import { WEI, fromWei, num, pct, price, usd } from "../src/format";

test("fromWei converts exact token amounts", () => {
  expect(fromWei(16_000_000n * WEI)).toBe(16_000_000);
  expect(fromWei(1_234_567_890_000_000_000_000n)).toBeCloseTo(1234.56789, 6);
  expect(fromWei(0n)).toBe(0);
});

test("num groups thousands", () => {
  expect(num(16_000_000)).toBe("16,000,000");
  expect(num(14_611.9)).toBe("14,612");
  expect(num(6.849, 2)).toBe("6.85");
});

test("usd is compact", () => {
  expect(usd(30_237_691)).toBe("$30.24M");
  expect(usd(120_950_765)).toBe("$121.0M");
  expect(usd(195_100)).toBe("$195.1k");
  expect(usd(178.4)).toBe("$178");
  expect(usd(0)).toBe("$0");
  expect(usd(2_500_000_000)).toBe("$2.500B");
});

test("price keeps four significant digits", () => {
  expect(price(0.01209504)).toBe("$0.01210");
  expect(price(0.0125)).toBe("$0.01250");
});

test("pct is signed with one decimal", () => {
  expect(pct(0.69)).toBe("+0.7%");
  expect(pct(-2.5442)).toBe("-2.5%");
  expect(pct(0)).toBe("+0.0%");
});
