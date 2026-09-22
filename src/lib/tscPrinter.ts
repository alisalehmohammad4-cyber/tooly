/**
 * TSPL (TSC Printer Language) raw commands for thermal barcode label printing
 * Physical label dimensions: 60mm Width × 30mm Height (Landscape)
 */

export interface TsplLabelConfig {
  serial: string;
  companyName: string;
  toolModel?: string;
  facilityName?: string;
  qrUrl: string;
  isReprint?: boolean;
}

/**
 * Generate TSPL commands for a 60mm x 30mm landscape thermal label roll
 * 
 * Set: SIZE 60 mm, 30 mm
 * Set: GAP 2 mm, 0 mm
 * Set: DIRECTION 1
 */
export function generateTsplLabel(config: TsplLabelConfig): string {
  const modelOrDesc = config.toolModel || config.facilityName || 'ציוד מבוקר';

  const commands: string[] = [
    'SIZE 60 mm, 30 mm',
    'GAP 2 mm, 0 mm',
    'DIRECTION 1',
    'CLS',
    // Side 1: High-res QR code (approx 22mm x 22mm -> 176x176 dots at 203 DPI)
    `QRCODE 24,24,M,5,A,0,M2,S7,"${config.qrUrl}"`,
    // Side 2: Micro Header (Company Name / Logo)
    `TEXT 230,20,"3",0,1,1,"${config.companyName}"`,
    // Side 2: Equipment / Tool Model Name
    `TEXT 230,60,"2",0,1,1,"${modelOrDesc}"`,
    // Side 2: Large bold Tag Number (e.g. ZR-1099)
    `TEXT 230,110,"4",0,1,1,"${config.serial}"`,
    'PRINT 1,1',
  ];

  return commands.join('\r\n');
}
