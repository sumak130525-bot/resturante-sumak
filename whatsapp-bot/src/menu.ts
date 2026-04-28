import { createClient } from '@supabase/supabase-js';
import { config } from './config';

const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

interface Category {
  id: string;
  name: string;
  name_es: string;
  name_qu: string;
  emoji: string;
  display_order: number;
}

interface MenuItem {
  id: string;
  name: string;
  name_es: string;
  description_es: string;
  price: number;
  category_id: string;
  is_available: boolean;
  display_order: number;
  categories?: Category;
}

interface MenuCache {
  items: MenuItem[];
  categories: Category[];
  timestamp: number;
}

let menuCache: MenuCache | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

export async function getCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Error fetching categories:', error.message);
    return [];
  }
  return data || [];
}

export async function getMenu(): Promise<{ items: MenuItem[]; categories: Category[] }> {
  const now = Date.now();

  if (menuCache && now - menuCache.timestamp < CACHE_TTL) {
    return { items: menuCache.items, categories: menuCache.categories };
  }

  try {
    const [categoriesResult, itemsResult] = await Promise.all([
      supabase
        .from('categories')
        .select('*')
        .order('order_pos', { ascending: true }),
      supabase
        .from('menu_items')
        .select('*, categories(*)')
        .eq('active', true)
        .gt('display_order', 0)
        .order('display_order', { ascending: true }),
    ]);

    const categories: Category[] = categoriesResult.data || [];
    const items: MenuItem[] = itemsResult.data || [];

    if (items.length === 0) {
      console.log('⚠️ No items from Supabase, items error:', itemsResult.error?.message);
    }

    menuCache = { items, categories, timestamp: now };
    return { items, categories };
  } catch (err) {
    console.error('Error fetching menu from Supabase:', err);
    return { items: [], categories: [] };
  }
}

function formatPrice(price: number): string {
  return `$${price.toLocaleString('es-AR')}`;
}

export async function formatMenuText(): Promise<string> {
  const { items, categories } = await getMenu();

  if (items.length === 0) {
    return getStaticMenu();
  }

  let text = `🍽️ *MENÚ RESTAURANTE SUMAK*\n\n`;

  for (const category of categories) {
    const categoryItems = items.filter((item) => item.category_id === category.id);
    if (categoryItems.length === 0) continue;

    text += `🍽️ *${category.name.toUpperCase()}*\n`;

    for (const item of categoryItems) {
      text += `  • ${item.name} — ${formatPrice(item.price)}`;
      if (item.description_es) {
        text += ` (${item.description_es.trim()})`;
      }
      text += '\n';
    }
    text += '\n';
  }

  text += `_Precios en pesos argentinos_`;
  return text;
}

export async function searchMenuItem(query: string): Promise<MenuItem[]> {
  const { items } = await getMenu();
  const q = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  return items.filter((item) => {
    const name = (item.name_es || item.name)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    const desc = (item.description_es || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    return name.includes(q) || desc.includes(q);
  });
}

// Menú estático de respaldo si Supabase falla
export function getStaticMenu(): string {
  return `🍽️ *MENÚ RESTAURANTE SUMAK*
_Precios en pesos argentinos_

🍲 *SOPAS*
  • Sopa de Maní — $5.000
  • Sopa de Trigo — $5.000
  • Sopa Puchero — $5.500

🍽️ *PLATOS PRINCIPALES*
  • Picante de Pollo — $9.000
  • Silpancho — $9.000
  • Falso Conejo — $9.000
  • Ají de Lengua — $9.000
  • Carne a la Olla — $9.000
  • Chicharrón de Cerdo — $14.000
  • Fricasé — $13.000
  • Pique Macho — $18.000
  • Pescado Sábalo Frito — $18.000

_Visitá ${config.restaurant.web} para pedir online 📲_`;
}
