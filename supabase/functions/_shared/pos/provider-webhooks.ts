// /supabase/functions/_shared/pos/provider-webhooks.ts
// SmartStock LiveRetail V2 — Provider-specific webhook verification & parsing
//
// The parsing rules here follow each provider's published webhook reference:
//
//   Shopify      JSON body; topic in X-Shopify-Topic; refunds/create is a
//                Refund resource, not an Order.
//   Square       JSON envelope; order.created / order.updated carry only
//                order metadata, so the full order must be retrieved with
//                RetrieveOrder before line items exist.
//   Lightspeed   application/x-www-form-urlencoded body with a `payload`
//                form field containing JSON.
//   Generic      JSON body with a caller-supplied event id.

import { RawPOSEnvelope } from "./connector-interface.ts";
import {
  SignatureResult,
  verifyCloverWebhook,
  verifyGenericWebhook,
  verifyLightspeedWebhook,
  verifyShopifyWebhook,
  verifySquareWebhook,
} from "./webhook-security.ts";

export type POSProvider =
  | "shopify"
  | "square"
  | "lightspeed"
  | "generic"
  | "clover"
  | "unsupported";

export interface POSConfigRow {
  id: string;
  tenant_id: string;
  store_id: string;
  pos_type: string;
  pos_name?: string | null;
  webhook_secret?: string | null;
  api_key?: string | null;
  api_secret?: string | null;
  is_active?: boolean | null;
  activation_mode?: string | null;
  config?: Record<string, unknown> | null;
}

export type POSPayloadErrorKind = "invalid" | "misconfigured" | "upstream";

export class POSPayloadError extends Error {
  constructor(
    message: string,
    readonly kind: POSPayloadErrorKind = "invalid",
  ) {
    super(message);
    this.name = "POSPayloadError";
  }
}

/** Headers worth persisting with a quarantined delivery so it can be replayed. */
const REPLAYABLE_HEADERS = new Set([
  "content-type",
  "x-shopify-topic",
  "x-shopify-shop-domain",
  "x-shopify-api-version",
  "x-shopify-webhook-id",
  "x-shopify-event-id",
  "x-shopify-hmac-sha256",
  "x-square-hmacsha256-signature",
  "x-signature",
  "x-clover-auth",
  "x-webhook-signature",
  "x-event-type",
]);

export function captureReplayableHeaders(headers: Headers): Record<string, string> {
  const captured: Record<string, string> = {};
  for (const [key, value] of headers.entries()) {
    const lower = key.toLowerCase();
    if (REPLAYABLE_HEADERS.has(lower)) captured[lower] = value;
  }
  return captured;
}

export function providerFor(posType: string): POSProvider {
  switch (posType) {
    case "shopify":
      return "shopify";
    case "square":
      return "square";
    case "lightspeed":
      return "lightspeed";
    case "clover":
      return "clover";
    case "webhook_cloud":
    case "generic_webhook":
      return "generic";
    default:
      return "unsupported";
  }
}

function configString(
  config: POSConfigRow,
  key: string,
): string | undefined {
  const value = config.config?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export async function verifyProviderWebhook(
  provider: POSProvider,
  rawBody: string,
  headers: Headers,
  config: POSConfigRow,
): Promise<SignatureResult> {
  switch (provider) {
    case "shopify":
      return verifyShopifyWebhook(rawBody, headers, config.webhook_secret);
    case "square":
      return verifySquareWebhook(
        rawBody,
        headers,
        config.webhook_secret,
        configString(config, "notification_url"),
      );
    case "lightspeed":
      return verifyLightspeedWebhook(rawBody, headers, config.webhook_secret);
    case "clover":
      return verifyCloverWebhook(headers, config.webhook_secret);
    case "generic":
      return verifyGenericWebhook(rawBody, headers, config.webhook_secret);
    default:
      return { ok: false, reason: "missing_secret" };
  }
}

function parseJsonObject(rawBody: string, label: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new POSPayloadError(`${label} body is not valid JSON`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new POSPayloadError(`${label} body must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

async function squareRetrieveOrder(
  orderId: string,
  config: POSConfigRow,
): Promise<Record<string, unknown>> {
  const accessToken = config.api_key || configString(config, "access_token");
  if (!accessToken) {
    throw new POSPayloadError(
      "Square access token is not configured (pos_configurations.api_key)",
      "misconfigured",
    );
  }

  const baseUrl = configString(config, "api_base_url") ?? "https://connect.squareup.com";
  const apiVersion = configString(config, "api_version");

  const requestHeaders: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };
  if (apiVersion) requestHeaders["Square-Version"] = apiVersion;

  let response: Response;
  try {
    response = await fetch(
      `${baseUrl}/v2/orders/${encodeURIComponent(orderId)}`,
      { headers: requestHeaders, signal: AbortSignal.timeout(4000) },
    );
  } catch (error) {
    throw new POSPayloadError(
      `Square RetrieveOrder failed: ${(error as Error).message}`,
      "upstream",
    );
  }

  if (response.status === 404) {
    throw new POSPayloadError(`Square order ${orderId} was not found`, "invalid");
  }
  if (!response.ok) {
    throw new POSPayloadError(
      `Square RetrieveOrder returned HTTP ${response.status}`,
      "upstream",
    );
  }

  const body = await response.json() as { order?: Record<string, unknown> };
  if (!body?.order) {
    throw new POSPayloadError(
      `Square RetrieveOrder returned no order for ${orderId}`,
      "upstream",
    );
  }
  return body.order;
}

export async function parseProviderPayload(
  provider: POSProvider,
  rawBody: string,
  headers: Headers,
  config: POSConfigRow,
): Promise<RawPOSEnvelope> {
  const receivedAt = new Date().toISOString();
  const replayHeaders = captureReplayableHeaders(headers);

  switch (provider) {
    case "shopify": {
      const payload = parseJsonObject(rawBody, "Shopify");
      const topic = headers.get("x-shopify-topic")?.trim() || "";

      if (!topic) {
        throw new POSPayloadError("Shopify delivery is missing X-Shopify-Topic");
      }

      const expectedShop = configString(config, "shop_domain");
      const actualShop = headers.get("x-shopify-shop-domain");
      if (expectedShop && actualShop && expectedShop !== actualShop) {
        throw new POSPayloadError(
          `Shopify delivery came from ${actualShop}, expected ${expectedShop}`,
        );
      }

      const isRefund = topic === "refunds/create";
      const id = payload.id;
      if (id == null) {
        throw new POSPayloadError(
          `Shopify ${topic} payload is missing id`,
        );
      }

      return {
        source_system: "SHOPIFY",
        // Order and refund deliveries use prefixes so the two resources can
        // never collide on the same numeric id.
        source_event_id: `${isRefund ? "refund" : "order"}-${id}`,
        event_type: topic,
        payload,
        headers: replayHeaders,
        received_at: receivedAt,
      };
    }

    case "square": {
      const envelope = parseJsonObject(rawBody, "Square");
      const eventType = String(envelope.type ?? "");
      const data = (envelope.data ?? {}) as Record<string, unknown>;
      const object = (data.object ?? {}) as Record<string, unknown>;

      const orderCreated = object.order_created as Record<string, unknown> | undefined;
      const orderUpdated = object.order_updated as Record<string, unknown> | undefined;

      // Square order webhooks carry only metadata; the order id is nested in
      // order_created / order_updated. Fall back to data.id for other events.
      const orderId =
        orderCreated?.order_id ??
        orderUpdated?.order_id ??
        data.id;

      if (orderId == null || String(orderId).length === 0) {
        throw new POSPayloadError(
          `Square ${eventType || "event"} notification contains no order id`,
        );
      }

      const order = await squareRetrieveOrder(String(orderId), config);

      return {
        source_system: "SQUARE",
        // The order is the transaction identity: later versions of the same
        // order must reduce against the same prior state.
        source_event_id: String(orderId),
        event_type: eventType || "order.updated",
        payload: { ...envelope, order },
        headers: replayHeaders,
        received_at: receivedAt,
      };
    }

    case "lightspeed": {
      // Official format: application/x-www-form-urlencoded with a `payload`
      // form field. Tolerate a raw JSON body for local testing.
      let payload: Record<string, unknown>;
      const form = new URLSearchParams(rawBody);
      const encoded = form.get("payload");

      if (encoded) {
        try {
          const parsed = JSON.parse(encoded) as unknown;
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new Error("not an object");
          }
          payload = parsed as Record<string, unknown>;
        } catch {
          throw new POSPayloadError("Lightspeed payload field is not valid JSON");
        }
      } else {
        payload = parseJsonObject(rawBody, "Lightspeed");
      }

      if (payload.id == null) {
        throw new POSPayloadError("Lightspeed sale payload is missing id");
      }

      return {
        source_system: "LIGHTSPEED",
        source_event_id: String(payload.id),
        event_type: configString(config, "webhook_event") ?? "sale.update",
        payload,
        headers: replayHeaders,
        received_at: receivedAt,
      };
    }

    case "generic": {
      const payload = parseJsonObject(rawBody, "Webhook");
      const id = payload.event_id ?? payload.id ?? payload.transaction_id;
      if (id == null || String(id).length === 0) {
        throw new POSPayloadError(
          "Generic webhook payload must include event_id, id, or transaction_id",
        );
      }

      return {
        source_system: "POS",
        source_event_id: String(id),
        event_type: String(payload.event_type ?? payload.type ?? "SALE"),
        payload,
        headers: replayHeaders,
        received_at: receivedAt,
      };
    }

    case "clover": {
      // Clover app webhooks are thin notifications
      // ({ appId, merchants: { <merchantId>: [{ objectId, type, ts }] } }).
      // They contain no order data, so processing requires calling the Clover
      // REST API. Until that reader exists we refuse rather than guess.
      throw new POSPayloadError(
        "Clover app webhooks carry only object references; the Clover order reader is not implemented",
        "misconfigured",
      );
    }

    default:
      throw new POSPayloadError(
        `POS type "${config.pos_type}" has no webhook implementation`,
        "misconfigured",
      );
  }
}
