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
        .order('display_order', { ascending: true }),
      supabase
        .from('menu_items')
        .select('*, categories(*)')
        .eq('is_available', true)
        .order('display_order', { ascending: true }),
    ]);

    const categories: Category[] = categoriesResult.data || [];
    const items: MenuItem[] = itemsResult.data || [];

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

    const emoji = category.emoji || '🍽️';
    const categoryName = category.name_es || category.name;
    text += `${emoji} *${categoryName.toUpperCase()}*\n`;

    for (const item of categoryItems) {
      const itemName = item.name_es || item.name;
      text += `  • ${itemName} - ${formatPrice(item.price)}\n`;
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

🍲 *SOPAS*
  • Sopa de maní
  • Chairo
  • Sopa del día

🍽️ *SEGUNDOS*
  • Picante de pollo
  • Sajta de pollo
  • Ají de lengua
  • Fricasé

🥗 *ENTRADAS*
  • Ensaladas del huerto
  • Anticuchos

🍮 *POSTRES*
  • Postre del día

_Para precios actualizados escribí *menu* o visitá ${config.restaurant.web}_`;
}
