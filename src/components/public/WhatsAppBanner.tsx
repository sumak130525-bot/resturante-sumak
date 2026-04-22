'use client'

import { WHATSAPP_NUMBER } from '@/lib/whatsapp'

/** Banner informativo "También podés pedirnos por WhatsApp" */
export function WhatsAppBanner() {
  const href = `https://wa.me/${WHATSAPP_NUMBER}`

  return (
    <section className="bg-[#075E54] text-white py-3 px-4">
      <div className="container mx-auto flex items-center justify-center gap-3 text-sm font-medium flex-wrap">
        {/* WhatsApp icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 32 32"
          className="w-5 h-5 fill-[#25D366] shrink-0"
        >
          <path d="M16.002 3C9.374 3 4 8.373 4 15.001c0 2.124.556 4.121 1.528 5.856L4 29l8.368-1.51A11.96 11.96 0 0016.002 28C22.629 28 28 22.627 28 16S22.629 3 16.002 3zm0 21.81a9.76 9.76 0 01-5.02-1.387l-.36-.213-3.73.673.686-3.637-.234-.374a9.768 9.768 0 01-1.488-5.16C5.856 9.24 10.375 4.856 16.002 4.856c5.626 0 10.144 4.384 10.144 10.144 0 5.763-4.518 10.81-10.144 10.81zm5.558-7.603c-.304-.152-1.8-.887-2.08-.988-.28-.1-.484-.152-.688.153-.203.305-.79.988-.968 1.19-.178.203-.356.228-.66.076-.304-.152-1.284-.473-2.446-1.509-.904-.806-1.515-1.8-1.692-2.105-.178-.305-.019-.47.134-.621.137-.136.304-.356.456-.533.152-.178.203-.305.305-.508.1-.203.05-.381-.025-.533-.076-.152-.688-1.66-.942-2.273-.248-.598-.5-.517-.689-.527l-.585-.01c-.203 0-.533.076-.812.381-.28.305-1.067 1.043-1.067 2.543 0 1.5 1.092 2.95 1.244 3.152.152.203 2.149 3.278 5.208 4.595.728.314 1.296.502 1.739.643.73.233 1.394.2 1.92.122.586-.087 1.8-.736 2.054-1.447.254-.711.254-1.32.178-1.447-.076-.127-.28-.203-.584-.356z" />
        </svg>
        <span>También podés pedirnos por WhatsApp</span>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-[#25D366] transition-colors font-semibold"
        >
          Escribinos ahora
        </a>
      </div>
    </section>
  )
}
