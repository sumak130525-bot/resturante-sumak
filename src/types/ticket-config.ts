export type TicketConfig = {
  width: number          // chars per line (22 = 58mm, 32 = 80mm)
  separator: string      // '-' | '*' | '.' | '='
  header1: string        // line 1 of header
  header2: string        // line 2 of header
  footer1: string        // line 1 of footer
  footer2: string        // line 2 of footer
  showLogo: boolean      // show logo image above ticket
  fontSize: string       // '10px' | '12px' | '14px'
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
}
