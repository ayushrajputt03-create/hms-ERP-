import { supabase } from './supabase'

// Anonymous QR self-booking. Both calls hit SECURITY DEFINER RPCs granted to
// anon — the `documents` table itself has no anon policy at all, so this is
// the only way in from an unauthenticated kiosk/phone page.

export async function getPublicBookingInfo(facilityId) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.rpc('get_public_booking_info', {
    p_facility_id: facilityId,
  })
  if (error) throw error
  return data
}

// No doctor or department argument by design. Self-booking collects who the
// patient is and issues a token; which clinician they see is a triage decision
// made by staff at the counter (hms_assign_qr_visit). The old signature took a
// doctorId straight off the public page.
export async function bookOpdVisitPublic({
  facilityId, patientName, patientPhone, patientAge, patientGender, reason,
}) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.rpc('book_opd_visit_public', {
    p_facility_id: facilityId,
    p_patient_name: patientName,
    p_patient_phone: patientPhone,
    p_patient_age: patientAge || null,
    p_patient_gender: patientGender || null,
    p_reason: reason || null,
  })
  if (error) throw error
  return data
}

const BOOKING_ERRORS = {
  FACILITY_NOT_FOUND: 'This booking link is invalid. Please contact the hospital reception.',
  // The facility has OPD switched off, so no member of staff is watching a
  // queue. Booking anyway would hand out a token nobody can honour.
  OPD_DISABLED: 'Online booking is not available at this hospital. Please visit the reception desk.',
  NAME_REQUIRED: 'Please enter the patient’s name.',
  INVALID_PHONE: 'Please enter a valid 10-digit mobile number.',
}

export function bookingErrorMessage(err) {
  const raw = err?.message || ''
  const hit = Object.keys(BOOKING_ERRORS).find((code) => raw.includes(code))
  return hit ? BOOKING_ERRORS[hit] : 'Could not complete the booking. Please try again or visit the reception desk.'
}
