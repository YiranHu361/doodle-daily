/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as billing from "../billing.js";
import type * as cast from "../cast.js";
import type * as commissions from "../commissions.js";
import type * as crons from "../crons.js";
import type * as editions from "../editions.js";
import type * as http from "../http.js";
import type * as ingest from "../ingest.js";
import type * as lib_cast from "../lib/cast.js";
import type * as lib_dates from "../lib/dates.js";
import type * as lib_device from "../lib/device.js";
import type * as lib_dto from "../lib/dto.js";
import type * as lib_feeds from "../lib/feeds.js";
import type * as lib_filter from "../lib/filter.js";
import type * as lib_formats from "../lib/formats.js";
import type * as lib_http from "../lib/http.js";
import type * as lib_inflate from "../lib/inflate.js";
import type * as lib_overlap from "../lib/overlap.js";
import type * as lib_png from "../lib/png.js";
import type * as lib_retry from "../lib/retry.js";
import type * as lib_script from "../lib/script.js";
import type * as lib_text from "../lib/text.js";
import type * as lib_urls from "../lib/urls.js";
import type * as lib_webhook from "../lib/webhook.js";
import type * as lib_whop from "../lib/whop.js";
import type * as papers from "../papers.js";
import type * as pipeline from "../pipeline.js";
import type * as providers_anthropic from "../providers/anthropic.js";
import type * as providers_index from "../providers/index.js";
import type * as providers_mockImage from "../providers/mockImage.js";
import type * as providers_mockScript from "../providers/mockScript.js";
import type * as providers_openai from "../providers/openai.js";
import type * as providers_placeholder from "../providers/placeholder.js";
import type * as providers_prompts from "../providers/prompts.js";
import type * as providers_types from "../providers/types.js";
import type * as reactions from "../reactions.js";
import type * as seed from "../seed.js";
import type * as seedData from "../seedData.js";
import type * as voice from "../voice.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  billing: typeof billing;
  cast: typeof cast;
  commissions: typeof commissions;
  crons: typeof crons;
  editions: typeof editions;
  http: typeof http;
  ingest: typeof ingest;
  "lib/cast": typeof lib_cast;
  "lib/dates": typeof lib_dates;
  "lib/device": typeof lib_device;
  "lib/dto": typeof lib_dto;
  "lib/feeds": typeof lib_feeds;
  "lib/filter": typeof lib_filter;
  "lib/formats": typeof lib_formats;
  "lib/http": typeof lib_http;
  "lib/inflate": typeof lib_inflate;
  "lib/overlap": typeof lib_overlap;
  "lib/png": typeof lib_png;
  "lib/retry": typeof lib_retry;
  "lib/script": typeof lib_script;
  "lib/text": typeof lib_text;
  "lib/urls": typeof lib_urls;
  "lib/webhook": typeof lib_webhook;
  "lib/whop": typeof lib_whop;
  papers: typeof papers;
  pipeline: typeof pipeline;
  "providers/anthropic": typeof providers_anthropic;
  "providers/index": typeof providers_index;
  "providers/mockImage": typeof providers_mockImage;
  "providers/mockScript": typeof providers_mockScript;
  "providers/openai": typeof providers_openai;
  "providers/placeholder": typeof providers_placeholder;
  "providers/prompts": typeof providers_prompts;
  "providers/types": typeof providers_types;
  reactions: typeof reactions;
  seed: typeof seed;
  seedData: typeof seedData;
  voice: typeof voice;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
