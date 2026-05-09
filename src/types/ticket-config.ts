export type TicketConfig = {
  width: number          // chars per line (22 = 58mm, 32 = 80mm)
  separator: string      // '-' | '*' | '.' | '='
  header1: string        // line 1 of header
  header2: string        // line 2 of header
  footer1: string        // line 1 of footer
  footer2: string        // line 2 of footer
  showLogo: boolean      // show logo image above ticket
  fontSize: string       // '10px' | '12px' | '14px'
  fontFamily: string     // 'monospace' | 'sans-serif' | 'serif'
  lineSpacing: number    // extra blank lines between sections (px equiv: 0/2/4/6/8)
  itemSpacing: number    // extra blank lines between order items (0/2/4/6)
  showOrderNumber: boolean
  showDate: boolean
  showPaymentMethod: boolean
  showTableNumber: boolean
  showDiningOption: boolean
  headerBold: boolean
  totalBold: boolean
}

export const DEFAULT_TICKET_CONFIG: TicketConfig = {
  width: 22,
  separator: '-',
  header1: 'SUMAK',
  header2: 'Restaurante',
  footer1: 'Gracias por su visita!',
  footer2: 'Restaurante Sumak',
  showLogo: true,
  fontSize: '12px',
  fontFamily: 'monospace',
  lineSpacing: 4,
  itemSpacing: 2,
  showOrderNumber: true,
  showDate: true,
  showPaymentMethod: true,
  showTableNumber: true,
  showDiningOption: true,
  headerBold: true,
  totalBold: true,
}
