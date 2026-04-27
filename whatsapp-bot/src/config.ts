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
    hours: process.env.HOURS || 'Lunes a Sábado 8:00 - 20:00',
  },
  // IA: obtené tu API key gratis en https://aistudio.google.com/apikey
  // Límite gratuito: 15 req/min, 1500 req/día (más que suficiente para un restaurante)
  geminiApiKey: process.env.GEMINI_API_KEY || '',
};
