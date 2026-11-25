import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeLiveArrivalCountdown,
  computeLiveServiceTimer,
  formatInr,
  formatSecondsTimer,
  getInitials,
  isValidTenDigitPhone,
  previewAnyAvailableStylist,
  sanitizePhoneDigits,
} from '../src/utils/formatters.js';
import { TRANSLATIONS, VALID_STAFF_SLUGS } from '../src/i18n/translations.js';

test('Phone sanitization and 10-digit validation match backend rules', () => {
  assert.equal(sanitizePhoneDigits('+91 98765-43210abc'), '9198765432');
  assert.equal(sanitizePhoneDigits('98765 43210'), '9876543210');
  assert.equal(isValidTenDigitPhone('9876543210'), true);
  assert.equal(isValidTenDigitPhone('98765'), false);
  assert.equal(isValidTenDigitPhone('987654321a'), false);
});

test('Live service timer & 10-minute arrival countdown calculate accurately', () => {
  const nowMs = Date.parse('2026-11-25T10:20:00.000Z');
  const timer = computeLiveServiceTimer('2026-11-25T10:05:00.000Z', 30, nowMs);
  assert.equal(timer.elapsedSeconds, 900);
  assert.equal(timer.remainingSeconds, 900);
  assert.equal(timer.progressPercent, 50);
  assert.equal(formatSecondsTimer(timer.remainingSeconds), '15:00');

  const arrivalOpen = computeLiveArrivalCountdown('2026-11-25T10:15:00.000Z', 10, nowMs);
  assert.equal(arrivalOpen.remainingSeconds, 300);
  assert.equal(arrivalOpen.isExpired, false);

  const arrivalExpired = computeLiveArrivalCountdown('2026-11-25T10:09:59.000Z', 10, nowMs);
  assert.equal(arrivalExpired.remainingSeconds, 0);
  assert.equal(arrivalExpired.isExpired, true);
});

test('Any Available preview selects lightest eligible on-duty stylist with available_since tiebreaker', () => {
  const staff = [
    {
      id: 's1',
      name_en: 'Aarav',
      is_on_duty: true,
      availability_status: 'Busy',
      available_since: '2026-11-25T05:00:00.000Z',
      qualified_service_ids: ['svc1', 'svc2'],
      workload_minutes: 45,
    },
    {
      id: 's2',
      name_en: 'Meera',
      is_on_duty: true,
      availability_status: 'Available',
      available_since: '2026-11-25T06:00:00.000Z',
      qualified_service_ids: ['svc1', 'svc2'],
      workload_minutes: 15,
    },
    {
      id: 's3',
      name_en: 'Riya',
      is_on_duty: true,
      availability_status: 'Available',
      available_since: '2026-11-25T04:00:00.000Z',
      qualified_service_ids: ['svc1', 'svc2'],
      workload_minutes: 15,
    },
    {
      id: 's4',
      name_en: 'Kabir',
      is_on_duty: true,
      availability_status: 'On Break',
      available_since: '2026-11-25T03:00:00.000Z',
      qualified_service_ids: ['svc1', 'svc2'],
      workload_minutes: 0,
    },
  ];

  const preview = previewAnyAvailableStylist(staff, ['svc1', 'svc2']);
  assert.equal(preview.hasEligibleStaff, true);
  assert.equal(preview.projectedStaff.id, 's3'); // tied at 15 min with Meera, available longer
  assert.equal(preview.estimatedWaitMinutes, 15);
});

test('Missing avatar initials, INR formatting, staff slugs, and EN/GU key parity are consistent', () => {
  assert.equal(getInitials('Aarav'), 'A');
  assert.equal(getInitials('Riya Patel'), 'RP');
  assert.equal(formatInr(1500), '₹1,500');
  assert.deepEqual(VALID_STAFF_SLUGS, ['aarav', 'meera', 'kabir', 'riya', 'ananya']);

  const enKeys = Object.keys(TRANSLATIONS.en).sort();
  const guKeys = Object.keys(TRANSLATIONS.gu).sort();
  assert.deepEqual(guKeys, enKeys);
});
