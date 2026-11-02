import { z } from "zod";

// Schemas for the fields we read, and only those. They are loose objects because
// PayPal adds fields. The field names and paths come from E-1: the create
// response carries purchase_units[].payments.authorizations[], and GET
// authorization carries id, status, amount, custom_id, expiration_time,
// create_time and supplementary_data.related_ids.order_id (D-019). The E-1
// collection (request E1-C.6) read the captures of an order from
// purchase_units[].payments.captures[], and the capture response (E1-C.4) was
// logged for id, status, amount and final_capture.

// Ids are placed in URL paths, so they are restricted to a safe alphabet.
export const PAYPAL_ID = /^[A-Za-z0-9_-]{1,128}$/;
const PayPalIdSchema = z.string().regex(PAYPAL_ID);

const MoneySchema = z.looseObject({
  currency_code: z.string().min(1).max(16),
  value: z.string().max(64),
});

export const OrderResponseSchema = z.looseObject({
  id: PayPalIdSchema,
  status: z.string(),
  purchase_units: z
    .array(
      z.looseObject({
        payments: z
          .looseObject({
            authorizations: z.array(z.looseObject({ id: PayPalIdSchema, status: z.string() })).optional(),
            captures: z.array(z.looseObject({ id: PayPalIdSchema, status: z.string() })).optional(),
          })
          .optional(),
      }),
    )
    .optional(),
});
export type OrderResponse = z.infer<typeof OrderResponseSchema>;

export const AuthorizationResponseSchema = z.looseObject({
  id: PayPalIdSchema,
  status: z.string(),
  amount: MoneySchema,
  custom_id: z.string().nullish(),
  expiration_time: z.string().nullish(),
  create_time: z.string().nullish(),
  supplementary_data: z
    .looseObject({
      related_ids: z.looseObject({ order_id: z.string().nullish() }).optional(),
    })
    .optional(),
});
export type AuthorizationResponse = z.infer<typeof AuthorizationResponseSchema>;

export const CaptureResponseSchema = z.looseObject({
  id: PayPalIdSchema,
  status: z.string(),
  amount: MoneySchema.optional(),
  final_capture: z.boolean().optional(),
});
export type CaptureResponse = z.infer<typeof CaptureResponseSchema>;

// Only the error name and the issue strings are read (D-019). The message is
// not used, because it may echo request data.
export const ErrorResponseSchema = z.looseObject({
  name: z.string().optional(),
  details: z.array(z.looseObject({ issue: z.string().optional() })).optional(),
});
