import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const config = {
  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },
  restaurant: {
    name: process.env.RESTAURANT_NAME || 'Sumak',
    phone: process.env.RESTAURANT_PHONE || '5492617526242',
    address: process.env.RESTAURANT_ADDRESS || 'Juan B Alberdi 247, frente a Terminal de Mendoza',
    maps: process.env.RESTAURANT_MAPS || 'https://maps.google.com/?q=-32.8949528,-68.8286573',
    web: process.env.RESTAURANT_WEB || 'https://restaurante-sumak.vercel.app',
    hours: process.env.HOURS || 'Lunes a Sábado 8:00 - 22:30',
  },
  // IA: Groq (gratis) — https://console.groq.com/keys
  // Límite gratuito: 30 req/min, 14400 req/día
  aiApiKey: process.env.AI_API_KEY || process.env.GEMINI_API_KEY || '',
  // MercadoPago Checkout Pro
  mercadoPagoAccessToken:
    process.env.MERCADOPAGO_ACCESS_TOKEN ||
    'APP_USR-3634705731484651-042317-d78059a6a1e76dd7409d6db3efd434f8-814513455',
};
