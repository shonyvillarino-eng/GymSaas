import PDFDocument from 'pdfkit';
import type { Prisma } from '@prisma/client';

/**
 * Internal receipt (comprobante interno).
 *
 * Deliberately NOT a fiscal invoice: the document states that it is an internal
 * administrative record, and generating it performs no writes of any kind.
 */

export interface ReceiptGym {
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
}

export interface ReceiptData {
  gym: ReceiptGym;
  receiptNumber: string;
  memberName: string;
  memberDocument?: string | null;
  concept: string;
  amount: Prisma.Decimal;
  currency: string;
  method: string;
  paidAt: Date;
  reference?: string | null;
  recordedBy?: string | null;
  voidedAt?: Date | null;
  notes?: string | null;
  obligation?: {
    concept: string;
    originalAmount: Prisma.Decimal;
    balance: Prisma.Decimal;
    dueDate: Date;
  } | null;
}

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Cash',
  TRANSFER: 'Transfer (declared)',
  BANK_TRANSFER: 'Bank transfer (declared)',
  CARD: 'Card (declared, processed externally)',
  CHECK: 'Cheque',
  OTHER: 'Other',
};

const CURRENCY_SYMBOLS: Record<string, string> = { ARS: '$', USD: '$', EUR: '€', BRL: 'R$', CLP: '$', UYU: '$', MXN: '$' };

function formatMoney(amount: Prisma.Decimal, currency: string): string {
  return `${CURRENCY_SYMBOLS[currency] ?? ''}${Number(amount).toFixed(2)} ${currency}`.trim();
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function buildReceiptPdf(data: ReceiptData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // compress:false keeps the text extractable, so the document can be audited
    // with plain tools; receipts are small enough that size is not a concern.
    const doc = new PDFDocument({ size: 'A4', margin: 48, compress: false });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const { width } = doc.page;

    // Header
    doc.font('Helvetica-Bold').fontSize(18).text(data.gym.name, 48, 48);
    doc.font('Helvetica').fontSize(9).fillColor('#555555');
    const contact = [data.gym.address, data.gym.city, data.gym.phone, data.gym.email].filter(Boolean).join(' · ');
    if (contact) doc.text(contact, 48, 72);

    doc.fillColor('#000000').font('Helvetica-Bold').fontSize(13).text('INTERNAL RECEIPT', 48, 110);
    doc.font('Helvetica').fontSize(9).fillColor('#555555');
    doc.text('Administrative record of a payment received outside this system.', 48, 128);
    doc.text('This document is NOT a fiscal invoice or tax receipt.', 48, 141);

    doc.fillColor('#000000').font('Helvetica-Bold').fontSize(11).text(`No. ${data.receiptNumber}`, 48, 168);
    doc.font('Helvetica').fontSize(10).text(`Date: ${formatDate(data.paidAt)}`, 48, 185);

    if (data.voidedAt) {
      doc.fillColor('#b00020').font('Helvetica-Bold').fontSize(12)
        .text(`VOIDED on ${formatDate(data.voidedAt)}`, 48, 205);
      doc.fillColor('#000000');
    }

    // Divider
    const lineY = data.voidedAt ? 228 : 205;
    doc.moveTo(48, lineY).lineTo(width - 48, lineY).strokeColor('#d0d0d0').stroke();

    // Member + payment details
    let y = lineY + 16;
    const rows: Array<[string, string]> = [
      ['Member', data.memberName],
      ...(data.memberDocument ? ([['Document', data.memberDocument]] as Array<[string, string]>) : []),
      ['Concept', data.concept],
      ['Amount received', formatMoney(data.amount, data.currency)],
      ['Payment method', METHOD_LABELS[data.method] ?? data.method],
      ...(data.reference ? ([['Reference', data.reference]] as Array<[string, string]>) : []),
      ...(data.obligation
        ? ([
            ['Related charge', data.obligation.concept],
            ['Charge total', formatMoney(data.obligation.originalAmount, data.currency)],
            ['Outstanding balance', formatMoney(data.obligation.balance, data.currency)],
          ] as Array<[string, string]>)
        : []),
      ...(data.recordedBy ? ([['Registered by', data.recordedBy]] as Array<[string, string]>) : []),
    ];

    for (const [label, value] of rows) {
      doc.font('Helvetica').fontSize(9).fillColor('#666666').text(label, 48, y, { width: 150 });
      doc.font('Helvetica').fontSize(10).fillColor('#000000').text(value, 200, y, { width: width - 248 });
      y = doc.y + 8;
    }

    if (data.notes) {
      y += 6;
      doc.font('Helvetica').fontSize(9).fillColor('#666666').text('Notes', 48, y);
      doc.font('Helvetica').fontSize(10).fillColor('#000000').text(data.notes, 48, y + 14, { width: width - 96 });
      y = doc.y + 8;
    }

    // Footer
    const footerY = Math.max(y + 24, 640);
    doc.moveTo(48, footerY).lineTo(width - 48, footerY).strokeColor('#d0d0d0').stroke();
    doc.font('Helvetica').fontSize(8).fillColor('#777777').text(
      'Internal administrative receipt generated by the gym management system. ' +
        'It records a payment received outside the platform; no online payment was processed. ' +
        'Keep it for internal control purposes only.',
      48,
      footerY + 12,
      { width: width - 96 },
    );

    doc.end();
  });
}
