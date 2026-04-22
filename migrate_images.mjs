/**
 * migrate_images.mjs
 * Migra imágenes de URLs externas (imgur/wikimedia) a Supabase Storage
 * 
 * Pasos:
 * 1. Crea bucket 'menu-images' en Supabase Storage (público)
 * 2. Obtiene los menu_items con sus image_url actuales
 * 3. Descarga cada imagen
 * 4. Sube al bucket
 * 5. Actualiza el registro en la DB con la nueva URL de Supabase
 */

import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from './node_modules/@supabase/supabase-js/dist/index.mjs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://zdepdnezwscvkgnxolqk.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'menu-images';
const TMP_DIR = path.join(process.cwd(), 'tmp_images');

// Crear cliente Supabase
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Crear directorio temporal
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

/**
 * Descarga una URL a un archivo local con manejo de redirecciones
 */
function downloadFile(url, destPath, maxRedirects = 10) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https://') ? https : http;
    
    protocol.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/jpeg,image/png,image/gif,image/*,*/*;q=0.8'
      }
    }, (res) => {
      // Manejar redirecciones
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
        if (maxRedirects <= 0) {
          reject(new Error('Demasiadas redirecciones'));
          return;
        }
        const redirectUrl = res.headers.location;
        console.log(`    Redirigiendo a: ${redirectUrl}`);
        res.resume();
        downloadFile(redirectUrl, destPath, maxRedirects - 1).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} al descargar ${url}`));
        return;
      }

      const file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        const size = fs.statSync(destPath).size;
        if (size < 1000) {
          fs.unlinkSync(destPath);
          reject(new Error(`Archivo muy pequeño (${size} bytes), probablemente error`));
          return;
        }
        resolve(destPath);
      });
      file.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Crea el bucket en Supabase Storage
 */
async function createBucket() {
  console.log('\n=== PASO 1: Creando bucket menu-images ===');
  
  // Verificar si ya existe
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (!listError && buckets) {
    const exists = buckets.find(b => b.id === BUCKET || b.name === BUCKET);
    if (exists) {
      console.log('  Bucket ya existe, continuando...');
      return true;
    }
  }
  
  const { data, error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    fileSizeLimit: 10485760 // 10MB
  });
  
  if (error) {
    if (error.message && error.message.includes('already exists')) {
      console.log('  Bucket ya existe.');
      return true;
    }
    console.error('  Error creando bucket:', error);
    return false;
  }
  
  console.log('  Bucket creado:', data);
  return true;
}

/**
 * Genera un nombre de archivo limpio a partir del nombre del plato
 */
function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

/**
 * Detecta la extensión de la imagen según la URL o content-type
 */
function getExtFromUrl(url) {
  // Buscar extensión en la URL
  const match = url.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i);
  if (match) return match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
  return 'jpg'; // default
}

/**
 * Sube imagen a Supabase Storage
 */
async function uploadToSupabase(filePath, fileName, contentType) {
  const fileBuffer = fs.readFileSync(filePath);
  
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(fileName, fileBuffer, {
      contentType: contentType || 'image/jpeg',
      upsert: true
    });
  
  if (error) {
    throw new Error(`Error subiendo ${fileName}: ${error.message}`);
  }
  
  // URL pública
  const { data: urlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(fileName);
  
  return urlData.publicUrl;
}

/**
 * Proceso principal
 */
async function main() {
  // PASO 1: Crear bucket
  const bucketOk = await createBucket();
  if (!bucketOk) {
    console.error('No se pudo crear el bucket. Abortando.');
    process.exit(1);
  }
  
  // PASO 2: Obtener menu_items con image_url
  console.log('\n=== PASO 2: Obteniendo menu_items ===');
  const { data: items, error: fetchError } = await supabase
    .from('menu_items')
    .select('id, name, image_url')
    .order('name');
  
  if (fetchError) {
    console.error('Error al obtener items:', fetchError);
    process.exit(1);
  }
  
  const itemsWithImages = items.filter(i => i.image_url && !i.image_url.includes('supabase.co'));
  const itemsAlreadyMigrated = items.filter(i => i.image_url && i.image_url.includes('supabase.co'));
  const itemsNoImage = items.filter(i => !i.image_url);
  
  console.log(`  Total items: ${items.length}`);
  console.log(`  Con imagen externa (a migrar): ${itemsWithImages.length}`);
  console.log(`  Ya en Supabase: ${itemsAlreadyMigrated.length}`);
  console.log(`  Sin imagen: ${itemsNoImage.length}`);
  
  if (itemsWithImages.length === 0) {
    console.log('\nNo hay imágenes externas que migrar.');
    
    // Mostrar estado actual
    console.log('\nEstado actual:');
    for (const item of items) {
      console.log(`  ${item.image_url ? 'OK' : 'FALTA'} | ${item.name}`);
    }
    return;
  }
  
  // PASO 3 + 4: Descargar y subir cada imagen
  console.log('\n=== PASO 3+4: Descargando y subiendo imágenes ===');
  
  const results = { ok: [], failed: [] };
  
  for (const item of itemsWithImages) {
    const slug = slugify(item.name);
    const ext = getExtFromUrl(item.image_url);
    const fileName = `${slug}.${ext}`;
    const localPath = path.join(TMP_DIR, fileName);
    const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
    
    console.log(`\n  [${item.name}]`);
    console.log(`    Fuente: ${item.image_url}`);
    console.log(`    Archivo: ${fileName}`);
    
    try {
      // Descargar
      console.log(`    Descargando...`);
      await downloadFile(item.image_url, localPath);
      const size = fs.statSync(localPath).size;
      console.log(`    Descargado: ${(size/1024).toFixed(1)} KB`);
      
      // Subir a Supabase
      console.log(`    Subiendo a Supabase...`);
      const publicUrl = await uploadToSupabase(localPath, fileName, contentType);
      console.log(`    URL: ${publicUrl}`);
      
      // PASO 5: Actualizar DB
      const { error: updateError } = await supabase
        .from('menu_items')
        .update({ image_url: publicUrl })
        .eq('id', item.id);
      
      if (updateError) {
        console.error(`    ERROR actualizando DB: ${updateError.message}`);
        results.failed.push({ name: item.name, reason: `DB update: ${updateError.message}` });
      } else {
        console.log(`    DB actualizada OK`);
        results.ok.push({ name: item.name, url: publicUrl });
      }
      
    } catch (err) {
      console.error(`    ERROR: ${err.message}`);
      results.failed.push({ name: item.name, reason: err.message });
    }
  }
  
  // PASO 6: Verificación final
  console.log('\n=== VERIFICACIÓN FINAL ===');
  const { data: verifyItems } = await supabase
    .from('menu_items')
    .select('id, name, image_url')
    .order('name');
  
  if (verifyItems) {
    for (const item of verifyItems) {
      const isSupabase = item.image_url && item.image_url.includes('supabase.co');
      const isExternal = item.image_url && !item.image_url.includes('supabase.co');
      const status = isSupabase ? 'SUPABASE' : isExternal ? 'EXTERNA' : 'FALTA';
      console.log(`  [${status}] ${item.name}`);
      if (isSupabase || isExternal) {
        console.log(`    ${item.image_url}`);
      }
    }
  }
  
  // Resumen
  console.log('\n=== RESUMEN ===');
  console.log(`Migradas exitosamente: ${results.ok.length}`);
  console.log(`Con errores: ${results.failed.length}`);
  
  if (results.failed.length > 0) {
    console.log('\nFallidas:');
    for (const f of results.failed) {
      console.log(`  - ${f.name}: ${f.reason}`);
    }
  }
  
  // Limpiar archivos temporales
  try {
    fs.rmSync(TMP_DIR, { recursive: true });
    console.log('\nArchivos temporales eliminados.');
  } catch(e) {
    console.log('\nNo se pudieron eliminar archivos temporales:', e.message);
  }
}

main().catch(e => {
  console.error('Error fatal:', e);
  process.exit(1);
});
