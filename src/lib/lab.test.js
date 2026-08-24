import { describe, it, expect, vi } from 'vitest'
import { updateLabOrderStatus, uploadLabResultFile } from './db'
import { getPendingItems } from './billing'
import * as dbModule from './db'

vi.mock('./supabase', () => ({
  supabase: {
    rpc: vi.fn((fnName, args) => {
      if (fnName === 'update_lab_order_status') {
        if (!args.p_path) return Promise.resolve({ data: null, error: new Error('ORDER_NOT_FOUND') })
        if (args.p_next_status === 'report_ready' && !args.p_results && !args.p_report_file_url) {
          return Promise.resolve({ data: null, error: new Error('READY_REQUIRES_RESULTS_OR_FILE') })
        }
        return Promise.resolve({
          data: {
            status: args.p_next_status,
            items: args.p_results,
            reportFileUrl: args.p_report_file_url,
          },
          error: null,
        })
      }
      return Promise.resolve({ data: null, error: new Error('Unknown RPC') })
    }),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(() => Promise.resolve({ data: { path: 'uploaded' }, error: null })),
        getPublicUrl: vi.fn((path) => ({ data: { publicUrl: `https://storage.test/${path}` } })),
      })),
    },
  },
}))

describe('Lab Module — RPC & Storage Wiring', () => {
  it('calls update_lab_order_status RPC with correct params', async () => {
    const res = await updateLabOrderStatus({
      path: 'facilities/f1/lab/orders/o1',
      nextStatus: 'sample_collected',
    })
    expect(res.status).toBe('sample_collected')
  })

  it('rejects report_ready without results or file url', async () => {
    await expect(
      updateLabOrderStatus({
        path: 'facilities/f1/lab/orders/o1',
        nextStatus: 'report_ready',
      })
    ).rejects.toThrow('READY_REQUIRES_RESULTS_OR_FILE')
  })

  it('allows report_ready when reportFileUrl is provided', async () => {
    const res = await updateLabOrderStatus({
      path: 'facilities/f1/lab/orders/o1',
      nextStatus: 'report_ready',
      reportFileUrl: 'https://storage.test/file.pdf',
    })
    expect(res.status).toBe('report_ready')
    expect(res.reportFileUrl).toBe('https://storage.test/file.pdf')
  })

  it('uploads lab result attachment to facility-scoped storage path', async () => {
    const file = new File(['content'], 'report.pdf', { type: 'application/pdf' })
    const url = await uploadLabResultFile({
      facilityId: 'f123',
      orderId: 'ord456',
      file,
    })
    expect(url).toContain('https://storage.test/')
    expect(url).toContain('facilities/f123/lab-orders/ord456/')
  })
})

describe('Lab Module — Billing Sync & Duplicate Prevention', () => {
  it('excludes lab orders that are billedUpstream or already billed', async () => {
    vi.spyOn(dbModule, 'queryDocuments').mockImplementation(async (path) => {
      if (path.includes('lab/orders')) {
        return [
          { id: 'l1', status: 'ordered', totalAmount: 500, items: [{ testName: 'CBC' }], billedUpstream: true },
          { id: 'l2', status: 'ordered', totalAmount: 300, items: [{ testName: 'LFT' }], billed: true },
          { id: 'l3', status: 'ordered', totalAmount: 400, items: [{ testName: 'KFT' }], billed: false },
        ]
      }
      return []
    })

    const pending = await getPendingItems('f1', 'p1')
    const labPending = pending.filter((item) => item.source === 'lab')

    expect(labPending.length).toBe(1)
    expect(labPending[0].orderId).toBe('l3')
    expect(labPending[0].amount).toBe(400)

    vi.restoreAllMocks()
  })
})
