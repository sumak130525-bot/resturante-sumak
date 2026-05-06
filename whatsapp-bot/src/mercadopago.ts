import { config } from './config';
import { CartSession } from './order';

// ── MercadoPago Checkout Pro ───────────────────────────────────────────────────

/**
 * Creates a MercadoPago Checkout Pro preference and returns the checkout URL.
 */
export async function createMercadoPagoPreference(session: CartSession): Promise<string> {
  const accessToken = config.mercadoPagoAccessToken;
  if (!accessToken) {
    throw new Error('MERCADOPAGO_ACCESS_TOKEN no configurado');
  }

  const items = session.cart.map((item) => ({
    id: item.id,
    title: item.name,
    quantity: item.quantity,
    unit_price: item.price,
    currency_id: 'ARS',
  }));

  const body = {
    items,
    payer: {
      name: session.customerName,
      phone: {
        area_code: '261',
        number: session.phone,
      },
    },
    payment_methods: {
      excluded_payment_types: [],
      installments: 1,
    },
    statement_descriptor: 'Restaurante Sumak',
    external_reference: `whatsapp_${session.phone}_${Date.now()}`,
    metadata: {
      channel: 'whatsapp',
      customer_phone: session.phone,
      customer_name: session.customerName,
    },
  };

  const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`MercadoPago API error ${response.status}: ${errorText}`);
  }

  const data = await response.json() as { init_point: string; sandbox_init_point: string };

  // Use init_point (production) — sandbox_init_point for testing
  return data.init_point || data.sandbox_init_point;
}
