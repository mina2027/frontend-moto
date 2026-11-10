import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DEFAULT_SETTINGS } from '@moto/shared';
import type { Sale } from '@/types';
import { useUiStore } from '@/stores/uiStore';
import SaleDetailsPage from './SaleDetailsPage';

const sale: Sale = {
  id: 's1', invoiceNumber: 'INV-1', date: '2026-01-01T00:00:00.000Z', branchId: 'br1', cashierId: 'u1',
  customerId: null, registerSessionId: 'sess1', items: [], subtotal: 100, itemDiscounts: 0, invoiceDiscount: 0,
  tax: 0, total: 100, paid: 100, remaining: 0, change: 0, payments: [{ method: 'cash', amount: 100 }],
  type: 'cash', status: 'completed',
};
let canPrint = true;

vi.mock('@/services', () => ({ salesService: { get: vi.fn(async () => sale), returns: vi.fn(async () => ({ data: [] })) } }));
vi.mock('@/hooks/useSettings', () => ({ useSettings: () => ({ settings: DEFAULT_SETTINGS, isLoading: false }) }));
vi.mock('@/hooks/useLookups', () => ({ useLookups: () => ({
  branchName: () => 'Branch', userName: () => 'Cashier', customerName: () => '', product: () => null,
  branches: [], users: [], customers: [], products: [], models: [],
}) }));
vi.mock('@/stores/authStore', () => ({ useAuthStore: (select: (state: { session: { user: { id: string } }; hasPermission: (permission: string) => boolean }) => unknown) => select({
  session: { user: { id: 'u1' } }, hasPermission: (permission) => permission === 'sales.print' && canPrint,
}) }));
vi.mock('@/features/whatsapp/SendWhatsAppDialog', () => ({ SendWhatsAppDialog: () => null }));

beforeEach(() => { canPrint = true; useUiStore.setState({ locale: 'en' }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); useUiStore.setState({ locale: 'ar' }); });

async function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/sales/s1']}><Routes><Route path="/sales/:id" element={<SaleDetailsPage />} /></Routes></MemoryRouter></QueryClientProvider>);
  await screen.findByRole('button', { name: 'Reprint' });
}

describe('printing invoices from ERP sale details', () => {
  it.each([
    ['Reprint', /Small invoice.*80mm/, 'mpt', '80mm'],
    ['Reprint', /Large invoice.*A4/, 'mpi', '210mm 297mm'],
    ['Print', /Small invoice.*80mm/, 'mpt', '80mm'],
    ['Print', /Large invoice.*A4/, 'mpi', '210mm 297mm'],
  ])('offers both sizes before the %s action prints %s', async (entry, size, className, page) => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {
      const document = window.document.querySelector('.invoice-print-document')!;
      expect(document.querySelector(`.${className}`)).toBeTruthy();
      expect(document.textContent).toContain(sale.invoiceNumber);
      expect(document.querySelector('button')).toBeNull();
      expect(window.document.body.lastElementChild?.textContent).toContain(`size: ${page}`);
    });
    await mount();
    fireEvent.click(screen.getByRole('button', { name: entry }));
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(print).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('radio', { name: size }));
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    await waitFor(() => expect(print).toHaveBeenCalledOnce());
    expect(window.document.querySelector('.invoice-print-document')).toBeNull();
  });

  it('cancels the size picker without printing', async () => {
    const print = vi.spyOn(window, 'print');
    await mount();
    fireEvent.click(screen.getByRole('button', { name: 'Reprint' }));
    fireEvent.click(screen.getByText('Close', { selector: 'button' }));
    expect(print).not.toHaveBeenCalled();
  });

  it('requires invoice print permission for both entry points', async () => {
    canPrint = false;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/sales/s1']}><Routes><Route path="/sales/:id" element={<SaleDetailsPage />} /></Routes></MemoryRouter></QueryClientProvider>);
    await screen.findByRole('heading', { name: sale.invoiceNumber });
    expect(screen.queryByRole('button', { name: 'Reprint' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Print' })).toBeNull();
  });
});
