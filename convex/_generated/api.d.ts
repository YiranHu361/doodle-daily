/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as editions from "../editions.js";
import type * as lib_cast from "../lib/cast.js";
import type * as lib_dates from "../lib/dates.js";
import type * as lib_dto from "../lib/dto.js";
import type * as lib_urls from "../lib/urls.js";
import type * as providers_index from "../providers/index.js";
import type * as providers_mockImage from "../providers/mockImage.js";
import type * as providers_mockScript from "../providers/mockScript.js";
import type * as providers_placeholder from "../providers/placeholder.js";
import type * as providers_types from "../providers/types.js";
import type * as reactions from "../reactions.js";
import type * as seed from "../seed.js";
import type * as seedData from "../seedData.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  editions: typeof editions;
  "lib/cast": typeof lib_cast;
  "lib/dates": typeof lib_dates;
  "lib/dto": typeof lib_dto;
  "lib/urls": typeof lib_urls;
  "providers/index": typeof providers_index;
  "providers/mockImage": typeof providers_mockImage;
  "providers/mockScript": typeof providers_mockScript;
  "providers/placeholder": typeof providers_placeholder;
  "providers/types": typeof providers_types;
  reactions: typeof reactions;
  seed: typeof seed;
  seedData: typeof seedData;
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
