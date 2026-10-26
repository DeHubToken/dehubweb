import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { cashoutStatus, isTransakUrl, parseCashoutRequest, sellWidgetParams, transakConfig, verifyHs256 } from "./transak.ts";

const b64url = (v: string | Buffer) => Buffer.from(v).toString("base64url");
const sign = (claims: object, secret: string, alg = "HS256") => {
  const head = `${b64url(JSON.stringify({ alg, typ: "JWT" }))}.${b64url(JSON.stringify(claims))}`;
  return `${head}.${createHmac("sha256", secret).update(head).digest("base64url")}`;
};

test("config is off without both secrets", () => {
  assert.equal(transakConfig(() => undefined), null);
  assert.equal(transakConfig((n) => (n === "TRANSAK_API_KEY" ? "k" : undefined)), null);
  const cfg = transakConfig((n) => ({ TRANSAK_API_KEY: "k", TRANSAK_API_SECRET: "s" } as Record<string, string>)[n]);
  assert.equal(cfg?.env, "production");
  assert.equal(cfg?.referrerDomain, "dehub.io");
});

test("request bounds", () => {
  assert.deepEqual(parseCashoutRequest({ amount: "25.5", network: "base" }), { amount: 25.5, network: "base" });
  assert.equal(parseCashoutRequest({ amount: 0.5, network: "base" }), null);
  assert.equal(parseCashoutRequest({ amount: 25, network: "eth" }), null);
  assert.equal(parseCashoutRequest({ amount: 25, network: "toString" }), null);
  assert.equal(parseCashoutRequest(null), null);
});

test("sell widget locks the order to our reference", () => {
  const cfg = { apiKey: "k", apiSecret: "s", env: "staging" as const, referrerDomain: "dehub.io" };
  const p = sellWidgetParams(cfg, { orderId: "o", wallet: "0xabc", amount: 10, network: "bsc", redirectURL: "https://dehub.io" });
  assert.equal(p.productsAvailed, "SELL");
  assert.equal(p.partnerOrderId, "o");
  assert.equal(p.cryptoCurrencyCode, "USDC");
  assert.equal("apiSecret" in p, false);
});

test("status mapping", () => {
  assert.equal(cashoutStatus("COMPLETED"), "completed");
  assert.equal(cashoutStatus("AWAITING_PAYMENT_FROM_USER"), "awaiting_crypto");
  assert.equal(cashoutStatus("PENDING_DELIVERY_FROM_TRANSAK"), "processing");
});

test("widget url host check", () => {
  assert.equal(isTransakUrl("https://global-stg.transak.com?apiKey=a&sessionId=b"), true);
  assert.equal(isTransakUrl("https://transak.com.evil.io/"), false);
  assert.equal(isTransakUrl("http://global.transak.com"), false);
});

test("webhook JWT verification", async () => {
  const claims = { webhookData: { partnerOrderId: "x", status: "COMPLETED" } };
  assert.deepEqual(await verifyHs256(sign(claims, "tok"), "tok"), claims);
  assert.equal(await verifyHs256(sign(claims, "other"), "tok"), null);
  assert.equal(await verifyHs256(sign(claims, "tok", "none"), "tok"), null);
  assert.equal(await verifyHs256("garbage", "tok"), null);
  assert.equal(await verifyHs256(sign({ exp: 1 }, "tok"), "tok"), null);
});
