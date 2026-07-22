export interface EmployeeProfile {
  level: string | null
  department: string | null
}

// Some policy entitlements (e.g. hotel tariff tiers, travel allowances) depend on the
// employee's own grade/department. Surfacing this in the prompt lets the model answer
// directly instead of asking the employee for information already on file.
export function formatEmployeeProfile(profile: EmployeeProfile): string {
  return `Employee Profile:\n- Grade/Level: ${profile.level ?? 'Not specified'}\n- Department: ${profile.department ?? 'Not specified'}`
}
