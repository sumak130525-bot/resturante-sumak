// Script para actualizar image_url en Supabase menu_items
// Usa @supabase/supabase-js que maneja el nuevo formato de keys

import { createClient } from './node_modules/@supabase/supabase-js/dist/index.mjs';

const SUPABASE_URL = 'https://zdepdnezwscvkgnxolqk.supabase.co';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Mapeo de imágenes: platos de la DB -> URLs de imágenes
// Fuente primaria: https://sumak2471.vercel.app (página de referencia)
// Fuente secundaria: Wikimedia Commons para platos no disponibles en la página de referencia
const IMAGE_MAP = [
  // Sopas encontradas directamente en la página de referencia
  { names: ['sopa de mani', 'sopa de maní'],          url: 'https://i.imgur.com/wsXLi1U.png' },
  { names: ['chairo'],                                  url: 'https://i.imgur.com/P2j7zsP.jpg' },
  { names: ['sopa de quinua'],                          url: 'https://i.imgur.com/OTcMOHx.jpg' },
  { names: ['lagua de choclo'],                         url: 'https://i.imgur.com/BTKwPPZ.jpg' },

  // Segundos - encontrados en la página de referencia
  { names: ['picante de pollo'],                        url: 'https://i.imgur.com/LoOi1IH.png' },
  { names: ['falso conejo'],                            url: 'https://i.imgur.com/Ompc66w.jpeg' },
  { names: ['silpancho', 'sil pancho'],                 url: 'https://i.imgur.com/zjPVtZe.jpg' },
  { names: ['chicharron de cerdo', 'chicharrón'],       url: 'https://i.imgur.com/cX4SPII.jpg' },
  { names: ['fricase', 'fricasé'],                      url: 'https://i.imgur.com/ZU8p4rG.jpeg' },

  // Entradas/típicos - página de referencia
  { names: ['saltena', 'salteña', 'empanadas salteñas'], url: 'https://i.imgur.com/0BKyeBl.jpg' },
  { names: ['api con pastel', 'api mas sopaipilla'],    url: 'https://i.imgur.com/SuAeI8p.jpeg' },

  // Platos con imágenes de referencia boliviana (Wikimedia/públicas)
  { names: ['pique macho'],
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Pique_macho.jpg/400px-Pique_macho.jpg' },
  { names: ['majadito'],
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Majadito.jpg/400px-Majadito.jpg' },
  { names: ['anticucho'],
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Anticuchos_de_corazon.jpg/400px-Anticuchos_de_corazon.jpg' },
  { names: ['sajta de pollo'],
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/Sajta_de_pollo.jpg/400px-Sajta_de_pollo.jpg' },
  { names: ['thimpu de cordero', 'timpu de cordero'],
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c0/Thimpu.jpg/400px-Thimpu.jpg' },
  { names: ['tucumana'],
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Tucumana.jpg/400px-Tucumana.jpg' },
  { names: ['llajua', 'llajwa'],
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Llajwa.jpg/400px-Llajwa.jpg' },
  { names: ['papa rellena'],
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Papa_Rellena.jpg/400px-Papa_Rellena.jpg' },
  { names: ['plato paceno', 'plato paceño'],
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Plato_pace%C3%B1o.jpg/400px-Plato_pace%C3%B1o.jpg' },
];

function normalize(str) {
  return str.toLowerCase()
    .normalize('NFD')
    .replace(/\u0300-\u036f/g, '')
    .replace(/[^\w\s]/g, '')
    .trim();
}

function findImage(itemName) {
  const normItem = itemName.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .trim();

  for (const entry of IMAGE_MAP) {
    for (const alias of entry.names) {
      const normAlias = alias.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9 ]/g, '')
        .trim();
      if (normItem === normAlias || normItem.includes(normAlias) || normAlias.includes(normItem)) {
        return entry.url;
      }
    }
  }
  
  // Fallback: busca por palabras
  const words = normItem.split(' ').filter(w => w.length > 3);
  for (const entry of IMAGE_MAP) {
    for (const alias of entry.names) {
      const normAlias = alias.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9 ]/g, '')
        .trim();
      for (const word of words) {
        if (normAlias.includes(word)) return entry.url;
      }
    }
  }
  
  return null;
}

async function main() {
  // Usar service role para acceso completo
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  console.log('=== STEP 1: Obteniendo menu_items de Supabase ===\n');

  const { data: items, error: fetchError } = await supabase
    .from('menu_items')
    .select('id, name, image_url');

  if (fetchError) {
    console.error('Error al obtener items:', fetchError);
    process.exit(1);
  }

  console.log(`Total items: ${items.length}\n`);
  for (const item of items) {
    console.log(`  [${item.id}] ${item.name} => ${item.image_url || 'NULL'}`);
  }

  console.log('\n=== STEP 2: Actualizando image_url ===\n');

  const updated = [];
  const notMapped = [];

  for (const item of items) {
    const imageUrl = findImage(item.name);

    if (!imageUrl) {
      console.log(`  [NO MATCH] "${item.name}"`);
      notMapped.push(item.name);
      continue;
    }

    console.log(`  Updating "${item.name}"`);
    console.log(`    URL: ${imageUrl}`);

    const { error: updateError } = await supabase
      .from('menu_items')
      .update({ image_url: imageUrl })
      .eq('id', item.id);

    if (updateError) {
      console.error(`    ERROR: ${updateError.message}`);
    } else {
      console.log(`    OK`);
      updated.push({ name: item.name, url: imageUrl });
    }
  }

  console.log('\n=== STEP 3: Verificacion final ===\n');

  const { data: verifyItems, error: verifyError } = await supabase
    .from('menu_items')
    .select('id, name, image_url');

  if (verifyError) {
    console.error('Error en verificacion:', verifyError);
  } else {
    const withImage = verifyItems.filter(i => i.image_url);
    const withoutImage = verifyItems.filter(i => !i.image_url);

    console.log(`Con image_url: ${withImage.length}`);
    console.log(`Sin image_url: ${withoutImage.length}`);

    if (withoutImage.length > 0) {
      console.log('\nItems SIN imagen:');
      for (const item of withoutImage) {
        console.log(`  - "${item.name}" (${item.id})`);
      }
    }

    console.log('\nVerificacion detallada:');
    for (const item of verifyItems) {
      const status = item.image_url ? 'OK' : 'FALTA';
      console.log(`  [${status}] ${item.name}`);
    }
  }

  console.log('\n=== RESUMEN ===');
  console.log(`Actualizados: ${updated.length}`);
  console.log(`Sin mapeo: ${notMapped.length}`);
  if (notMapped.length > 0) {
    console.log('Sin imagen:', notMapped.join(', '));
  }
}

main().catch(e => { console.error('Fatal error:', e); process.exit(1); });
