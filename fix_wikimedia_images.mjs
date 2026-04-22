/**
 * fix_wikimedia_images.mjs
 * Descarga y sube a Supabase las 9 imágenes de Wikimedia que fallaron
 * usando URLs directas (sin thumbnail)
 */

import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from './node_modules/@supabase/supabase-js/dist/index.mjs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://zdepdnezwscvkgnxolqk.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'menu-images';
const TMP_DIR = path.join(process.cwd(), 'tmp_images2');

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

// Las 9 imágenes que fallaron con sus URLs directas (sin /thumb/)
const WIKIMEDIA_IMAGES = [
  {
    dbName: 'Anticucho',
    fileName: 'anticucho.jpg',
    url: 'https://upload.wikimedia.org/wikipedia/commons/0/09/Anticuchos_bolivianos.jpg'
  },
  {
    dbName: 'Llajua',
    fileName: 'llajua.jpg',
    url: 'https://upload.wikimedia.org/wikipedia/commons/1/14/Llajua_boliviana.jpg'
  },
  {
    dbName: 'Majadito',
    fileName: 'majadito.jpg',
    url: 'https://upload.wikimedia.org/wikipedia/commons/a/a2/Majadito_o_majau.jpg'
  },
  {
    dbName: 'Papa Rellena',
    fileName: 'papa-rellena.jpg',
    url: 'https://upload.wikimedia.org/wikipedia/commons/c/cb/Relleno_de_papa%2C_Bolivia.jpg'
  },
  {
    dbName: 'Pique Macho',
    fileName: 'pique-macho.jpg',
    url: 'https://upload.wikimedia.org/wikipedia/commons/9/9e/Pique_macho.jpg'
  },
  {
    dbName: 'Plato Paceño',
    fileName: 'plato-paceno.jpg',
    url: 'https://upload.wikimedia.org/wikipedia/commons/a/aa/Plato_Pace%C3%B1o.jpg'
  },
  {
    dbName: 'Sajta de Pollo',
    fileName: 'sajta-de-pollo.jpg',
    url: 'https://upload.wikimedia.org/wikipedia/commons/0/04/Sajta_de_pollo.jpg'
  },
  {
    dbName: 'Thimpu de Cordero',
    fileName: 'thimpu-de-cordero.jpg',
    url: 'https://upload.wikimedia.org/wikipedia/commons/3/3c/Thimpu_de_cordero.jpg'
  },
  {
    dbName: 'Tucumana',
    fileName: 'tucumana.jpg',
    url: 'https://upload.wikimedia.org/wikipedia/commons/8/8c/Tucumanas_bolivianas.jpg'
  },
];

function downloadFile(url, destPath, maxRedirects = 10) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https://') ? https : http;
    
    protocol.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'image/jpeg,image/png,image/*,*/*',
        'Referer': 'https://commons.wikimedia.org/'
      }
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
        if (maxRedirects <= 0) {
          reject(new Error('Too many redirects'));
          return;
        }
        const redirectUrl = res.headers.location;
        console.log(`    -> Redirect: ${redirectUrl}`);
        res.resume();
        downloadFile(redirectUrl, destPath, maxRedirects - 1).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      const file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        const size = fs.statSync(destPath).size;
        if (size < 1000) {
          fs.unlinkSync(destPath);
          reject(new Error(`File too small: ${size} bytes`));
          return;
        }
        resolve(destPath);
      });
      file.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    }).on('error', reject);
  });
}

async function uploadToSupabase(filePath, fileName) {
  const fileBuffer = fs.readFileSync(filePath);
  const ext = path.extname(fileName).slice(1).toLowerCase();
  const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
  
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(fileName, fileBuffer, { contentType, upsert: true });
  
  if (error) throw new Error(`Upload error: ${error.message}`);
  
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(fileName);
  return urlData.publicUrl;
}

// Agrega delay entre requests a Wikimedia para evitar rate limiting
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('=== Migrando imágenes de Wikimedia (URLs directas) ===\n');
  
  const results = { ok: [], failed: [] };
  
  for (const img of WIKIMEDIA_IMAGES) {
    console.log(`[${img.dbName}]`);
    console.log(`  URL: ${img.url}`);
    
    const localPath = path.join(TMP_DIR, img.fileName);
    
    try {
      // Esperar 2 segundos entre descargas de Wikimedia
      await sleep(2000);
      
      console.log(`  Descargando...`);
      await downloadFile(img.url, localPath);
      const size = fs.statSync(localPath).size;
      console.log(`  OK: ${(size/1024).toFixed(1)} KB`);
      
      console.log(`  Subiendo a Supabase...`);
      const publicUrl = await uploadToSupabase(localPath, img.fileName);
      console.log(`  URL pública: ${publicUrl}`);
      
      // Actualizar DB: buscar por nombre exacto
      const { data: items, error: fetchErr } = await supabase
        .from('menu_items')
        .select('id, name')
        .ilike('name', img.dbName);
      
      if (fetchErr || !items || items.length === 0) {
        // Intentar búsqueda más flexible
        const { data: items2, error: fetchErr2 } = await supabase
          .from('menu_items')
          .select('id, name')
          .ilike('name', `%${img.dbName.split(' ')[0]}%`);
        
        if (fetchErr2 || !items2 || items2.length === 0) {
          console.log(`  WARN: No se encontró el item '${img.dbName}' en la DB`);
          results.failed.push({ name: img.dbName, reason: 'No encontrado en DB' });
          continue;
        }
        
        // Actualizar el primero que coincida
        const { error: updateErr } = await supabase
          .from('menu_items')
          .update({ image_url: publicUrl })
          .eq('id', items2[0].id);
        
        if (updateErr) {
          console.log(`  ERROR DB: ${updateErr.message}`);
          results.failed.push({ name: img.dbName, reason: updateErr.message });
        } else {
          console.log(`  DB actualizada: ${items2[0].name}`);
          results.ok.push({ name: img.dbName, url: publicUrl });
        }
      } else {
        const { error: updateErr } = await supabase
          .from('menu_items')
          .update({ image_url: publicUrl })
          .eq('id', items[0].id);
        
        if (updateErr) {
          console.log(`  ERROR DB: ${updateErr.message}`);
          results.failed.push({ name: img.dbName, reason: updateErr.message });
        } else {
          console.log(`  DB actualizada: ${items[0].name}`);
          results.ok.push({ name: img.dbName, url: publicUrl });
        }
      }
      
    } catch (err) {
      console.log(`  ERROR: ${err.message}`);
      results.failed.push({ name: img.dbName, reason: err.message });
    }
    
    console.log('');
  }
  
  // Verificación final
  console.log('=== VERIFICACIÓN FINAL ===');
  const { data: allItems } = await supabase
    .from('menu_items')
    .select('name, image_url')
    .order('name');
  
  let supabaseCount = 0, externalCount = 0, missingCount = 0;
  for (const item of allItems) {
    const isSupabase = item.image_url?.includes('supabase.co');
    const isExternal = item.image_url && !isSupabase;
    if (isSupabase) supabaseCount++;
    else if (isExternal) externalCount++;
    else missingCount++;
    
    const status = isSupabase ? 'SUPABASE' : isExternal ? 'EXTERNA' : 'FALTA';
    console.log(`  [${status}] ${item.name}`);
  }
  
  console.log(`\nTotal en Supabase: ${supabaseCount}`);
  console.log(`Externas aún: ${externalCount}`);
  console.log(`Sin imagen: ${missingCount}`);
  console.log(`\nMigradas esta vez: ${results.ok.length}`);
  console.log(`Fallidas: ${results.failed.length}`);
  
  if (results.failed.length > 0) {
    console.log('\nFallidas:');
    for (const f of results.failed) console.log(`  - ${f.name}: ${f.reason}`);
  }
  
  // Limpiar tmp
  try { fs.rmSync(TMP_DIR, { recursive: true }); } catch(e) {}
}

main().catch(e => { console.error(e); process.exit(1); });
