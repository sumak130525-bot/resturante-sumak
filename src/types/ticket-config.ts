export type TicketConfig = {
  // Layout
  width: number          // chars per line (22 = 58mm, 32 = 80mm)

  // Margins (mm)
  marginLeft: number     // 0/2/4/6/8 mm
  marginRight: number    // 0/2/4/6/8 mm
  marginTop: number      // 0/2/4/6/8 mm
  marginBottom: number   // 0/4/8/12/16 mm

  // Typography
  fontFamily: string     // 'monospace' | 'sans-serif' | 'serif'
  fontSize: string       // '10px' | '12px' | '14px'
  headerBold: boolean
  totalBold: boolean
  itemsBold: boolean     // reserved for future ESC/POS use

  // Spacing
  lineSpacing: number    // extra line height px (0/2/4/6/8)
  itemSpacing: number    // extra blank lines between order items (0/2/4/6)
  sectionSpacing: number // blank lines between header/items/footer sections (2/4/6/8)

  // Separators
  separator: string      // '-' | '*' | '.' | '='
  separatorFullWidth: boolean  // use full paper width (ignores margins)
  separatorDouble: boolean     // repeat separator line twice

  // Content
  showLogo: boolean
  showOrderNumber: boolean
  showDate: boolean
  showTableNumber: boolean
  showDiningOption: boolean
  showPaymentMethod: boolean
  showCustomerName: boolean
  showPersons: boolean        // show number of persons
  showPersonDetail: boolean   // group items by P1 P2 etc.
  showOrderNote: boolean      // show order note

  // Texts
  header1: string
  header2: string
  footer1: string
  footer2: string

  // Printing
  autoCut: boolean
  feedLinesBeforeCut: number  // 0/1/2/3/4/5
  headerAlign: 'center' | 'left'
  footerAlign: 'center' | 'left'
}

export const DEFAULT_TICKET_CONFIG: TicketConfig = {
  width: 22,

  marginLeft: 0,
  marginRight: 0,
  marginTop: 4,
  marginBottom: 4,

  fontFamily: 'monospace',
  fontSize: '12px',
  headerBold: true,
  totalBold: true,
  itemsBold: false,

  lineSpacing: 4,
  itemSpacing: 2,
  sectionSpacing: 4,

  separator: '-',
  separatorFullWidth: true,
  separatorDouble: false,

  showLogo: true,
  showOrderNumber: true,
  showDate: true,
  showTableNumber: true,
  showDiningOption: true,
  showPaymentMethod: true,
  showCustomerName: true,
  showPersons: true,
  showPersonDetail: true,
  showOrderNote: true,

  header1: 'SUMAK',
  header2: 'Restaurante',
  footer1: 'Gracias por su visita!',
  footer2: 'Restaurante Sumak',

  autoCut: true,
  feedLinesBeforeCut: 3,
  headerAlign: 'center',
  footerAlign: 'center',
}
