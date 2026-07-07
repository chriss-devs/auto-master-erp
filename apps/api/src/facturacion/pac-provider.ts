import { createHash } from 'crypto';

/**
 * Límite externo de facturación electrónica (D-012, 08 §6):
 * la interfaz PacProvider aísla al PAC concreto (Q-002 sin decidir).
 * Cambiar de PAC = implementar esta interfaz; Ventas no se toca.
 */
export interface PacDocumento {
  ventaId: string;
  numero: string;
  puntoEmision: string;
  emisor: { nombre: string; ruc?: string | null; dv?: string | null; direccion?: string | null };
  receptor: { nombre: string; rucOCedula?: string | null; dv?: string | null; tipo: string };
  lineas: Array<{ descripcion: string; cantidad: string; precioUnitario: string; descuento: string; baseGravable: string; tasaItbms: string; itbms: string; total: string }>;
  totales: { subtotal: string; descuentoTotal: string; itbmsTotal: string; total: string };
  fechaEmision: string;
}

export interface PacResultado {
  estado: 'AUTORIZADA' | 'EMITIDA' | 'PENDIENTE_TRANSMISION' | 'RECHAZADA';
  cufe: string | null;
  urlQr?: string | null;
  mensaje: string;
  raw?: unknown;
}

export interface PacProvider {
  readonly nombre: string;
  emitir(doc: PacDocumento): Promise<PacResultado>;
}

export const PAC_PROVIDER = Symbol('PAC_PROVIDER');

/**
 * Stub de contingencia (BL-009, RF-FAC-005/RN-104): no hay PAC contratado (Q-002).
 * Marca la factura PENDIENTE_TRANSMISION con CUFE simulado y trazable.
 * La venta NUNCA se bloquea por facturación.
 */
export class StubPacProvider implements PacProvider {
  readonly nombre = 'STUB';

  async emitir(doc: PacDocumento): Promise<PacResultado> {
    const hash = createHash('sha256').update(`${doc.ventaId}|${doc.numero}|${doc.totales.total}`).digest('hex');
    return {
      estado: 'PENDIENTE_TRANSMISION',
      cufe: `FE-SIM-${hash.slice(0, 28).toUpperCase()}`,
      urlQr: null,
      mensaje: 'PAC no configurado (Q-002): documento emitido en contingencia, pendiente de transmitir a la DGI.',
      raw: { simulado: true },
    };
  }
}
