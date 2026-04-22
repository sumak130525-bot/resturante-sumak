/**
 * fix_remaining_images.mjs
 * Descarga y sube las 9 imágenes restantes desde fuentes alternativas
 */

import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from './node_modules/@supabase/supabase-js/dist/index.mjs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://zdepdnezwscvkgnxolqk.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'menu-images';
const TMP_DIR = path.join(process.cwd(), 'tmp_images3');

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

const IMAGES = [
  {
    dbName: 'Anticucho',
    fileName: 'anticucho.jpg',
    url: 'https://perudelights.com/wp-content/uploads/2013/01/anticuchos-1.jpg'
  },
  {
    dbName: 'Llajua',
    fileName: 'llajua.jpg',
    url: 'https://boliviancookbook.com/wp-content/uploads/2012/01/llajua-small.jpg'
  },
  {
    dbName: 'Majadito',
    fileName: 'majadito.jpg',
    url: 'https://chipabythedozen.com/wp-content/uploads/2020/08/majadito-1-700x450.jpg'
  },
  {
    dbName: 'Papa Rellena',
    fileName: 'papa-rellena.jpg',
    url: 'https://chipabythedozen.com/wp-content/uploads/2020/08/Bolivian-stuffed-potatoes-700x1050.jpg'
  },
  {
    dbName: 'Pique Macho',
    fileName: 'pique-macho.jpg',
    url: 'https://boliviancookbook.com/wp-content/uploads/2014/01/blog261.jpg'
  },
  {
    dbName: 'Plato Paceño',
    fileName: 'plato-paceno.jpg',
    url: 'https://live.staticflickr.com/8266/8670903364_6200712813.jpg'
  },
  {
    dbName: 'Sajta de Pollo',
    fileName: 'sajta-de-pollo.jpg',
    url: 'https://vibrantflavorsoftheworld.com/wp-content/uploads/2022/09/Chicken-Sajta.jpg'
  },
  {
    dbName: 'Thimpu de Cordero',
    fileName: 'thimpu-de-cordero.jpg',
    url: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEh3I03JafcC10KAzspYaZORwe3vkTJSLxLOHE7l5qTXZmR4c98Ss1ZENkoOJlVlQlJHE7X8Iev9iSwLRQOhRU0hB03vTpXHiCy1vBM2rAMBZx9PbsRUPQH_FxTOcrbPRM94EkknJT8gytxI/s1600/Thimpo+de+cordero_plato_filtro.jpg'
  },
  {
    dbName: 'Tucumana',
    fileName: 'tucumana.jpg',
    url: 'https://boliviancookbook.com/wp-content/uploads/2014/01/blog19.jpg'
  },
];

function downloadFile(url, destPath, maxRedirects = 10) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https://') ? https : http;
    
    protocol.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache'
      }
    }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode)) {
        if (maxRedirects <= 0) { reject(new Error('Too many redirects')); return; }
        const redirectUrl = res.headers.location;
        console.log(`    -> ${redirectUrl}`);
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
        if (size < 500) {
          fs.unlinkSync(destPath);
          reject(new Error(`Too small: ${size} bytes`));
          return;
        }
        resolve(destPath);
      });
      file.on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
    }).on('error', reject);
  });
}

async function uploadToSupabase(filePath, fileName) {
  const fileBuffer = fs.readFileSync(filePath);
  const ext = path.extname(fileName).slice(1).toLowerCase();
  const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
  
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(fileName, fileBuffer, { contentType, upsert: true });
  
  if (error) throw new Error(`Upload: ${error.message}`);
  
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(fileName);
  return urlData.publicUrl;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('=== Fix: Imágenes alternativas para 9 platos ===\n');
  
  const results = { ok: [], failed: [] };
  
  for (const img of IMAGES) {
    console.log(`[${img.dbName}]`);
    const localPath = path.join(TMP_DIR, img.fileName);
    
    try {
      console.log(`  Descargando: ${img.url.substring(0, 70)}...`);
      await downloadFile(img.url, localPath);
      const size = fs.statSync(localPath).size;
      console.log(`  OK: ${(size/1024).toFixed(1)} KB`);
      
      const publicUrl = await uploadToSupabase(localPath, img.fileName);
      console.log(`  Supabase: ${publicUrl}`);
      
      // Actualizar DB - buscar por nombre exacto primero
      let updated = false;
      
      const { data: items } = await supabase
        .from('menu_items')
        .select('id, name, image_url')
        .order('name');
      
      if (items) {
        // Buscar el item que coincida con el nombre
        const normalizeStr = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        const normTarget = normalizeStr(img.dbName);
        
        const match = items.find(item => {
          const normItem = normalizeStr(item.name);
          return normItem === normTarget || normItem.includes(normTarget) || normTarget.includes(normItem);
        });
        
        if (match) {
          const { error: updateErr } = await supabase
            .from('menu_items')
            .update({ image_url: publicUrl })
            .eq('id', match.id);
          
          if (updateErr) {
            console.log(`  ERROR DB: ${updateErr.message}`);
            results.failed.push({ name: img.dbName, reason: updateErr.message });
          } else {
            console.log(`  DB OK: "${match.name}"`);
            results.ok.push({ name: img.dbName, url: publicUrl });
            updated = true;
          }
        } else {
          console.log(`  WARN: No encontrado en DB: "${img.dbName}"`);
          results.failed.push({ name: img.dbName, reason: 'Not found in DB' });
        }
      }
      
    } catch (err) {
      console.log(`  ERROR: ${err.message}`);
      results.failed.push({ name: img.dbName, reason: err.message });
    }
    
    console.log('');
    await sleep(500);
  }
  
  // Verificación final
  console.log('\n=== VERIFICACIÓN FINAL ===');
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
    const status = isSupabase ? 'OK   ' : isExternal ? 'EXT  ' : 'FALTA';
    console.log(`  [${status}] ${item.name}`);
  }
  
  console.log(`\nEn Supabase: ${supabaseCount}/20`);
  console.log(`Externas: ${externalCount}`);
  console.log(`Sin imagen: ${missingCount}`);
  console.log(`\nMigradas: ${results.ok.length} | Fallidas: ${results.failed.length}`);
  
  if (results.failed.length > 0) {
    console.log('\nFallidas:');
    results.failed.forEach(f => console.log(`  - ${f.name}: ${f.reason}`));
  }
  
  try { fs.rmSync(TMP_DIR, { recursive: true }); } catch(e) {}
}

main().catch(e => { console.error(e); process.exit(1); });
