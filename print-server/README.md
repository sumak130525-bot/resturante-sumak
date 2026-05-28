# Servidor local de impresión Sumak

Servidor local para imprimir tickets del POS directamente en una impresora térmica ESC/POS por red.

## Configuración actual

- PC: `192.168.100.77`
- Servidor: `http://192.168.100.77:4000`
- Impresora: `192.168.100.55`
- Puerto impresora: `9100`
- Papel: 80mm

## Instalación

Desde esta carpeta:

```powershell
npm install
```

## Ejecutar en modo desarrollo

```powershell
npm run dev
```

## Probar estado

Abrir desde la PC o tablet:

```text
http://192.168.100.77:4000/health
```

Debe responder `ok: true`.

## Imprimir ticket de prueba

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:4000/test-print
```

## Ejecutar compilado

```powershell
npm run build
npm start
```

## Importante

La PC, la tablet y la impresora deben estar en la misma red. Si Windows Firewall bloquea el puerto `4000`, permitir acceso de Node.js en redes privadas.
