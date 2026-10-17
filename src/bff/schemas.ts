import { Type } from 'typebox';

/** Response schemas: used for validation/serialization and in the OpenAPI docs. */

export const Sku = Type.String({ pattern: '^SL-[0-9]{4}$', examples: ['SL-1002'] });

export const ErrorSchema = Type.Object({ error: Type.String(), message: Type.String() });

const Promotion = Type.Union([
  Type.Object({ id: Type.String(), label: Type.String(), discountCents: Type.Integer() }),
  Type.Null(),
]);

export const PriceViewSchema = Type.Object({
  currency: Type.Literal('EUR'),
  basePriceCents: Type.Integer(),
  finalPriceCents: Type.Integer(),
  formatted: Type.String({ examples: ['€1,249.00'] }),
  formattedBase: Type.Union([Type.String(), Type.Null()]),
  promotion: Promotion,
});

export const AvailabilitySchema = Type.Object({
  status: Type.Union([
    Type.Literal('in_stock'),
    Type.Literal('low_stock'),
    Type.Literal('out_of_stock'),
    Type.Literal('unknown'),
  ]),
  quantity: Type.Union([Type.Integer(), Type.Null()]),
  canAddToCart: Type.Boolean(),
});

const Degraded = Type.Array(Type.String(), {
  description: 'Services that failed while building this response (partial data).',
  examples: [['inventory']],
});

export const ProductPageSchema = Type.Object({
  sku: Type.String(),
  name: Type.String(),
  brand: Type.String(),
  category: Type.String(),
  description: Type.String(),
  imageUrl: Type.String(),
  price: Type.Union([PriceViewSchema, Type.Null()]),
  availability: AvailabilitySchema,
  degraded: Degraded,
});

export const CartSchema = Type.Object({
  cartId: Type.String({ format: 'uuid' }),
  lines: Type.Array(
    Type.Object({
      sku: Type.String(),
      quantity: Type.Integer(),
      name: Type.Union([Type.String(), Type.Null()]),
      imageUrl: Type.Union([Type.String(), Type.Null()]),
      unitPrice: Type.Union([PriceViewSchema, Type.Null()]),
      lineTotalCents: Type.Union([Type.Integer(), Type.Null()]),
      lineTotalFormatted: Type.Union([Type.String(), Type.Null()]),
      availability: AvailabilitySchema,
    }),
  ),
  totals: Type.Union([
    Type.Object({
      itemCount: Type.Integer(),
      subtotalCents: Type.Integer(),
      discountCents: Type.Integer(),
      totalCents: Type.Integer(),
      formatted: Type.Object({
        subtotal: Type.String(),
        discount: Type.String(),
        total: Type.String(),
      }),
    }),
    Type.Null(),
  ]),
  warnings: Type.Array(Type.String()),
  degraded: Degraded,
});

export const CartLinesSchema = Type.Object({
  cartId: Type.String(),
  lines: Type.Array(Type.Object({ sku: Type.String(), quantity: Type.Integer() })),
});

export const CartIdHeader = Type.Object({
  'x-cart-id': Type.Optional(Type.String({ format: 'uuid' })),
});
