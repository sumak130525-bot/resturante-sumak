'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type Locale = 'es' | 'en' | 'qu'

type TranslationDict = {
  // Header / Nav
  menuLive: string
  menuConnecting: string
  myOrder: string
  restaurantSubtitle: string

  // Hero
  authenticCuisine: string
  welcomeTo: string
  heroSubtitle: string
  viewMenu: string
  realtimeStock: string

  // Mesa badge
  mesaBadge: string

  // Category tabs
  allMenu: string
  menuSection: string

  // Category names (for tabs override — DB names stay as-is)
  catBebidas: string
  catDesayunos: string
  catSopas: string
  catSegundo: string
  catParaLlevar: string
  catEmpanadas: string
  catPlatos: string
  catAcompanamientos: string

  // Menu card
  photoSoon: string
  soldOut: string
  addToCart: string
  inOrder: string

  // Availability
  oneAvailable: string
  available: string

  // Cart drawer
  yourOrder: string
  cartEmpty: string
  cartEmptyDesc: string
  viewMenuBtn: string
  orderTotal: string
  confirmOrder: string
  orderByWhatsApp: string
  clearCart: string
  whatsAppFormTitle: string
  yourName: string
  phonePlaceholder: string
  notePlaceholder: string
  cancel: string
  confirm: string
  sending: string

  // Order form (OrderForm.tsx)
  backToCart: string
  orderSummary: string
  total: string
  yourData: string
  nameLabel: string
  namePlaceholder: string
  phoneLabel: string
  phoneOptional: string
  notesLabel: string
  notesOptional: string
  notesSamplePlaceholder: string
  payWithMP: string
  redirectingMP: string
  nameRequired: string

  // WhatsApp Banner
  waBannerText: string
  waBannerCta: string

  // Footer
  footerTagline: string
  footerRealtime: string
  footerCopyright: string

  // Push notifications button
  enableNotifications: string
  notificationsEnabled: string
  notificationsBlocked: string
  notificationsBlockedInstructions: string
  notificationsBlockedMobile: string
  notificationsBlockedDesktop: string
  notificationsBlockedClose: string

  // Pedido/estado page
  paymentApproved: string
  paymentApprovedDesc: string
  orderNumber: string
  backToMenu: string
  paymentFailure: string
  paymentFailureDesc: string
  paymentPending: string
  paymentPendingDesc: string
}

// ─── Dictionaries ─────────────────────────────────────────────────────────────

const translations: Record<Locale, TranslationDict> = {
  es: {
    menuLive: 'Menú en vivo',
    menuConnecting: 'Conectando…',
    myOrder: 'Mi pedido',
    restaurantSubtitle: 'Restaurante Boliviano',

    authenticCuisine: 'Auténtica cocina boliviana',
    welcomeTo: 'Bienvenidos a',
    heroSubtitle: 'Sabores del altiplano, preparados con tradición. Haz tu pedido en línea y disfruta lo mejor de la gastronomía boliviana.',
    viewMenu: 'Ver el menú',
    realtimeStock: 'Cantidades actualizadas en tiempo real',

    mesaBadge: '🪑 Mesa {mesa} — Tu pedido será enviado a tu mesa',

    allMenu: 'Todo el menú',
    menuSection: 'Menú',
    catBebidas: 'Bebidas',
    catDesayunos: 'Desayunos',
    catSopas: 'Sopas',
    catSegundo: 'Segundo',
    catParaLlevar: 'Para llevar',
    catEmpanadas: 'Empanadas',
    catPlatos: 'Platos Principales',
    catAcompanamientos: 'Acompañamientos',

    photoSoon: 'Foto próximamente',
    soldOut: 'Agotado',
    addToCart: 'Agregar',
    inOrder: 'En pedido',

    oneAvailable: '1 disponible',
    available: '{n} disponibles',

    yourOrder: 'Tu pedido',
    cartEmpty: 'Tu carrito está vacío',
    cartEmptyDesc: 'Agrega platos desde el menú para comenzar tu pedido.',
    viewMenuBtn: 'Ver menú',
    orderTotal: 'Total del pedido',
    confirmOrder: 'Confirmar pedido',
    orderByWhatsApp: 'Pedir por WhatsApp',
    clearCart: 'Vaciar carrito',
    whatsAppFormTitle: '¿A nombre de quién va el pedido?',
    yourName: 'Tu nombre *',
    phonePlaceholder: 'Teléfono (opcional)',
    notePlaceholder: 'Nota (opcional): sin cebolla, extra llajua…',
    cancel: 'Cancelar',
    confirm: 'Confirmar',
    sending: 'Enviando...',

    backToCart: 'Volver al carrito',
    orderSummary: 'Resumen del pedido',
    total: 'Total',
    yourData: 'Tus datos',
    nameLabel: 'Nombre *',
    namePlaceholder: 'Tu nombre completo',
    phoneLabel: 'Teléfono',
    phoneOptional: '(opcional)',
    notesLabel: 'Notas',
    notesOptional: '(opcional)',
    notesSamplePlaceholder: 'Sin cebolla, extra llajua, alergia a…',
    payWithMP: 'Pagar con MercadoPago',
    redirectingMP: 'Redirigiendo a MercadoPago…',
    nameRequired: 'Por favor ingresa tu nombre.',

    waBannerText: 'También podés pedirnos por WhatsApp',
    waBannerCta: 'Escribinos ahora',

    footerTagline: 'Auténticos sabores del altiplano',
    footerRealtime: 'Menú y cantidades en tiempo real',
    footerCopyright: '© {year} Sumak Restaurante Boliviano. Todos los precios en pesos colombianos (COP).',

    enableNotifications: 'Activar notificaciones',
    notificationsEnabled: 'Notificaciones activadas ✅',
    notificationsBlocked: 'Las notificaciones están bloqueadas',
    notificationsBlockedInstructions: 'Para activarlas:',
    notificationsBlockedMobile: 'En celular: tocá los 3 puntos ⋮ → Configuración del sitio → Notificaciones → Permitir',
    notificationsBlockedDesktop: 'En computadora: hacé click en el candado 🔒 al lado de la URL → Notificaciones → Permitir',
    notificationsBlockedClose: 'Entendido',

    paymentApproved: '¡Pago confirmado!',
    paymentApprovedDesc: 'Tu pedido fue confirmado y está en preparación. En breve lo tendrás listo.',
    orderNumber: 'Pedido #{id}',
    backToMenu: 'Volver al menú',
    paymentFailure: 'Pago no procesado',
    paymentFailureDesc: 'No pudimos procesar tu pago. Podés intentarlo de nuevo o comunicarte con nosotros.',
    paymentPending: 'Pago pendiente',
    paymentPendingDesc: 'Tu pago está siendo procesado. Una vez confirmado, tu pedido pasará a preparación automáticamente.',
  },

  en: {
    menuLive: 'Live menu',
    menuConnecting: 'Connecting…',
    myOrder: 'My order',
    restaurantSubtitle: 'Bolivian Restaurant',

    authenticCuisine: 'Authentic Bolivian cuisine',
    welcomeTo: 'Welcome to',
    heroSubtitle: 'Flavors of the highlands, prepared with tradition. Order online and enjoy the best of Bolivian gastronomy.',
    viewMenu: 'View menu',
    realtimeStock: 'Stock updated in real time',

    mesaBadge: '🪑 Table {mesa} — Your order will be sent to your table',

    allMenu: 'Full menu',
    menuSection: 'Menu',
    catBebidas: 'Drinks',
    catDesayunos: 'Breakfasts',
    catSopas: 'Soups',
    catSegundo: 'Main dish',
    catParaLlevar: 'Take away',
    catEmpanadas: 'Empanadas',
    catPlatos: 'Main courses',
    catAcompanamientos: 'Sides',

    photoSoon: 'Photo coming soon',
    soldOut: 'Sold out',
    addToCart: 'Add',
    inOrder: 'In order',

    oneAvailable: '1 available',
    available: '{n} available',

    yourOrder: 'Your order',
    cartEmpty: 'Your cart is empty',
    cartEmptyDesc: 'Add dishes from the menu to start your order.',
    viewMenuBtn: 'View menu',
    orderTotal: 'Order total',
    confirmOrder: 'Confirm order',
    orderByWhatsApp: 'Order via WhatsApp',
    clearCart: 'Clear cart',
    whatsAppFormTitle: 'Who is the order for?',
    yourName: 'Your name *',
    phonePlaceholder: 'Phone (optional)',
    notePlaceholder: 'Note (optional): no onion, extra sauce…',
    cancel: 'Cancel',
    confirm: 'Confirm',
    sending: 'Sending...',

    backToCart: 'Back to cart',
    orderSummary: 'Order summary',
    total: 'Total',
    yourData: 'Your details',
    nameLabel: 'Name *',
    namePlaceholder: 'Your full name',
    phoneLabel: 'Phone',
    phoneOptional: '(optional)',
    notesLabel: 'Notes',
    notesOptional: '(optional)',
    notesSamplePlaceholder: 'No onion, extra sauce, allergy to…',
    payWithMP: 'Pay with MercadoPago',
    redirectingMP: 'Redirecting to MercadoPago…',
    nameRequired: 'Please enter your name.',

    waBannerText: 'You can also order via WhatsApp',
    waBannerCta: 'Message us now',

    footerTagline: 'Authentic flavors of the highlands',
    footerRealtime: 'Menu and stock updated in real time',
    footerCopyright: '© {year} Sumak Bolivian Restaurant. All prices in Colombian pesos (COP).',

    enableNotifications: 'Enable notifications',
    notificationsEnabled: 'Notifications enabled ✅',
    notificationsBlocked: 'Notifications are blocked',
    notificationsBlockedInstructions: 'To enable them:',
    notificationsBlockedMobile: 'On mobile: tap the 3 dots ⋮ → Site settings → Notifications → Allow',
    notificationsBlockedDesktop: 'On desktop: click the lock 🔒 next to the URL → Notifications → Allow',
    notificationsBlockedClose: 'Got it',

    paymentApproved: 'Payment confirmed!',
    paymentApprovedDesc: 'Your order has been confirmed and is being prepared. It will be ready shortly.',
    orderNumber: 'Order #{id}',
    backToMenu: 'Back to menu',
    paymentFailure: 'Payment not processed',
    paymentFailureDesc: 'We could not process your payment. You can try again or contact us.',
    paymentPending: 'Payment pending',
    paymentPendingDesc: 'Your payment is being processed. Once confirmed, your order will automatically move to preparation.',
  },

  qu: {
    menuLive: 'Mikhuna kawsaq',
    menuConnecting: 'Tupachikuykushan…',
    myOrder: 'Ñuqap mañasqay',
    restaurantSubtitle: 'Bolivia mikhuna wasi',

    authenticCuisine: 'Chiqap Bolivia mikhuna',
    welcomeTo: 'Hamuy',
    heroSubtitle: 'Altiplano sabores, tradicionwan rurasqa. Llajtamanta mikunata mañay.',
    viewMenu: 'Mikhuna qhaway',
    realtimeStock: 'Mikunakuna kaqlla yachachispan',

    mesaBadge: '🪑 Mesa {mesa} — Qampa mañasqayki mesaykiman apasqa kanqa',

    allMenu: 'Lliw mikhuna',
    menuSection: 'Mikhuna',
    catBebidas: 'Upyay',
    catDesayunos: 'Inti llaqsimuy mikuy',
    catSopas: 'Lawakuna',
    catSegundo: 'Qhipa mikhuna',
    catParaLlevar: 'Apakuy',
    catEmpanadas: 'Empanadas',
    catPlatos: 'Hatun mikhuna',
    catAcompanamientos: 'Yanapa mikhuna',

    photoSoon: 'Foto qhipaman',
    soldOut: 'Tukurqa',
    addToCart: 'Yapay',
    inOrder: "Q'ipimpi",

    oneAvailable: '1 kachkan',
    available: '{n} kachkanku',

    yourOrder: "Q'ipi",
    cartEmpty: "Q'ipiyki ch'usaq",
    cartEmptyDesc: 'Mikhunata yapay mañakunaykipaq.',
    viewMenuBtn: 'Mikhuna qhaway',
    orderTotal: 'Lliw qullqi',
    confirmOrder: 'Mañay saqiy',
    orderByWhatsApp: 'WhatsApp-pi mañay',
    clearCart: "Q'ipita ch'usachiy",
    whatsAppFormTitle: 'Pipa sutin mañaypi?',
    yourName: 'Sutiyki *',
    phonePlaceholder: 'Waqyana (mana requsirispa)',
    notePlaceholder: 'Qillqa (mana requsirispa)…',
    cancel: 'Saqiy',
    confirm: 'Saqisqa',
    sending: 'Kachaykushan...',

    backToCart: "Q'ipiman kutiy",
    orderSummary: 'Mañay tupay',
    total: 'Lliw',
    yourData: 'Qampa sutinki',
    nameLabel: 'Suti *',
    namePlaceholder: 'Lliw sutiyki',
    phoneLabel: 'Waqyana',
    phoneOptional: '(mana requsirispa)',
    notesLabel: 'Qillqa',
    notesOptional: '(mana requsirispa)',
    notesSamplePlaceholder: 'Mana sibuyas, yapay llajwa…',
    payWithMP: 'MercadoPago-pi qullqi quy',
    redirectingMP: 'MercadoPago-man rishanki…',
    nameRequired: 'Ama hina kaspa sutiykita qillqay.',

    waBannerText: 'WhatsApp-piwan mañaymanpis',
    waBannerCta: 'Kunan qillqaykuway',

    footerTagline: 'Chiqap altiplano mikuna',
    footerRealtime: 'Mikhuna kawsaqlla yachachispan',
    footerCopyright: '© {year} Sumak Bolivia Mikhuna Wasi. Lliw qullqikuna COP-pi.',

    enableNotifications: 'Willay chaskiy',
    notificationsEnabled: 'Willaykunata chaskichkanki ✅',
    notificationsBlocked: 'Willaykunata saqisqa',
    notificationsBlockedInstructions: 'Kicharinankipaq:',
    notificationsBlockedMobile: 'Waqyanapi: 3 puntosta ⋮ tocay → Llaqta churay → Willay → Saqiy',
    notificationsBlockedDesktop: 'Computadorapi: candadota 🔒 tocay URL pata → Willay → Saqiy',
    notificationsBlockedClose: 'Entendirqani',

    paymentApproved: 'Qullqi chaskirqa!',
    paymentApprovedDesc: 'Mañasqayki saqisqa, rurakushan. Askham riqsisqa kanqa.',
    orderNumber: 'Mañay #{id}',
    backToMenu: 'Mikhunaman kutiy',
    paymentFailure: 'Qullqi mana chaskirqachu',
    paymentFailureDesc: 'Mana atirqaychu qullqiykita chaskiriy. Qatipanki o noqaykuwanmi rimanki.',
    paymentPending: 'Qullqi suyashan',
    paymentPendingDesc: 'Qullqiyki chechaykushan. Chaskirqaspas, mañasqayki rurakunanpaq rinqa.',
  },
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface LanguageContextValue {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: keyof TranslationDict, vars?: Record<string, string | number>) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

// ─── Provider ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'sumak_locale'

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('es')

  // Hydrate from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Locale | null
      if (stored && ['es', 'en', 'qu'].includes(stored)) {
        setLocaleState(stored)
      }
    } catch {
      // ignore (SSR / private browsing)
    }
  }, [])

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    try { localStorage.setItem(STORAGE_KEY, l) } catch { /* ignore */ }
  }, [])

  const t = useCallback(
    (key: keyof TranslationDict, vars?: Record<string, string | number>): string => {
      let str = translations[locale][key] ?? translations['es'][key] ?? String(key)
      if (vars) {
        Object.entries(vars).forEach(([k, v]) => {
          str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
        })
      }
      return str
    },
    [locale]
  )

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTranslation() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useTranslation must be used inside LanguageProvider')
  return ctx
}

// ─── Item locale helpers ───────────────────────────────────────────────────────

type LocalisableItem = {
  name: string
  description: string | null
  name_en?: string | null
  name_qu?: string | null
  description_es?: string | null
  description_en?: string | null
  description_qu?: string | null
}

export function getItemName(item: LocalisableItem, locale: Locale): string {
  if (locale === 'en') return item.name_en ?? item.name
  if (locale === 'qu') return item.name_qu ?? item.name
  return item.name
}

export function getItemDescription(item: LocalisableItem, locale: Locale): string | null {
  if (locale === 'en') return item.description_en ?? item.description_es ?? item.description
  if (locale === 'qu') return item.description_qu ?? item.description_es ?? item.description
  return item.description_es ?? item.description
}
