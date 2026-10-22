import { describe, expect, it } from 'vitest'
import { buildOpdSlipPDF } from './pdf'

describe('OPD patient parchi', () => {
  it('builds a single-page A4 record with the patient and visit identity', async () => {
    const pdf = await buildOpdSlipPDF({
      facility: {
        facilityName: 'City Hospital',
        address: 'Main Road',
        city: 'Delhi',
        phone: '9876543210',
      },
      patient: {
        name: 'Sample Patient',
        uhid: 'HMS-2026-00001',
        dob: '1980-01-01',
        gender: 'male',
        phone: '9876543210',
        allergies: ['Penicillin'],
        conditions: ['Hypertension'],
      },
      visit: {
        tokenNumber: 12,
        deptRegNo: 'OPD-12',
        departmentName: 'General Medicine',
        doctorName: 'A. Sharma',
        roomNumber: '102',
        floor: 'First Floor',
        visitDate: Date.UTC(2026, 9, 22, 9, 30),
      },
    })

    expect(pdf.getNumberOfPages()).toBe(1)
    expect(pdf.internal.pageSize.getWidth()).toBeCloseTo(210, 0)
    expect(pdf.internal.pageSize.getHeight()).toBeCloseTo(297, 0)

    const output = pdf.output()
    expect(output).toContain('OUT PATIENT RECORD')
    expect(output).toContain('Sample Patient')
    expect(output).toContain("DOCTOR'S NOTES / DIAGNOSIS / ADVICE")
  })
})
