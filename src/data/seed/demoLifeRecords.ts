import { demoProvenance } from '../../domain/foundation/provenance';
import { addDays, type LocalDate } from '../../domain/logicalDay';
import type { LifeRecord } from '../../domain/state';

/**
 * The demo household's Life Admin records (HK-FEATURE-12). At most five, unmistakably fictional, and never realistic: no real
 * document number, address, person, insurer or case. Reference values use the DEMO-000N form only. Dates are relative to the demo's
 * anchor day so the screen always shows one thing to review, one thing coming up and one quiet record. A demo household never
 * syncs and never claims (its provenance is `demo-seed`, which the cloud refuses), so none of this can reach an account.
 */
export function demoLifeRecords(anchorDate: LocalDate, at: string): LifeRecord[] {
  const base = {
    issuedOn: null,
    expiresOn: null,
    renewBy: null,
    reviewOn: null,
    issuerName: null,
    referenceNumber: null,
    locationHint: null,
    note: null,
    subjectMemberId: null,
    status: 'active' as const,
    archivedAt: null,
    createdAt: at,
    updatedAt: at,
    provenance: demoProvenance(),
    scope: 'personal' as const,
  };
  return [
    {
      ...base,
      id: 'life-record-demo-1',
      title: 'Sample Passport',
      kind: 'credential',
      typeName: 'Passport',
      referenceNumber: 'DEMO-0001',
      expiresOn: addDays(anchorDate, 10),
      locationHint: 'Demo drawer',
    },
    {
      ...base,
      id: 'life-record-demo-2',
      title: 'Demo Registration',
      kind: 'registration',
      typeName: 'Vehicle registration',
      referenceNumber: 'DEMO-0002',
      renewBy: addDays(anchorDate, -2),
      expiresOn: addDays(anchorDate, 20),
    },
    {
      ...base,
      id: 'life-record-demo-3',
      title: 'Example Policy',
      kind: 'policy',
      typeName: 'Insurance policy',
      issuerName: 'Example Insurer',
      reviewOn: addDays(anchorDate, 40),
    },
  ];
}
