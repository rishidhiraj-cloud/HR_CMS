import { chunkText } from '@/lib/embeddings'

describe('chunkText', () => {
  it('keeps a numbered policy clause self-contained instead of blending it into a neighboring clause', () => {
    // Mirrors the real Leave Policy document: a long Casual Leave clause immediately
    // followed by a much shorter Sick Leave clause, with no real paragraph breaks
    // (as commonly produced by PDF/OCR extraction).
    const text =
      "2.2.2 Casual Leave  Every employee is entitled to Ten (10) casual leave with pay in a Financial Year, " +
      "which can be availed on pro-rata basis for matters of personal nature and such absence will not be " +
      "deducted from annual leave.  At a stretch a maximum of three and a half days of casual leave can be " +
      "availed and it cannot be combined with Annual Leave or Sick Leave.  All intervening holidays including " +
      "Saturdays, Sundays & weekly off will be treated as Casual Leave.  Casual leave should be applied at " +
      "least one day in advance for approval. In case of emergency when the leave is not planned, the employee " +
      "should personally call his/ her Line Manager to inform about the leave. Line Manager may refuse casual " +
      "leave to an employee in case of exceptional pressure of work, necessarily requiring the employee's " +
      "presence. However, casual leave should not be denied in case of accident, death or sickness in the " +
      "family.  Casual leaves with pay cannot be accumulated beyond one year. " +
      "2.2.3 Sick Leave  Sick leave up to a maximum of Ten (10 ) days per Financial Year is allowed and will " +
      "not be deducted from annual leave.  Sick leave has to be reported to the manager in the morning of the " +
      "first day of absence. " +
      "2.2.4 Maternity Leave  The Maternity Leave will be applicable to women employees at all locations."

    const chunks = chunkText(text, 800, 150)
    const sickLeaveChunk = chunks.find(c => c.includes('Ten (10 ) days per Financial Year'))

    expect(sickLeaveChunk).toBeDefined()
    expect(sickLeaveChunk).toContain('2.2.3 Sick Leave')
    // A chunk answering "how many sick leaves" shouldn't be bulked out with
    // unrelated Casual Leave specifics — that dilutes its embedding toward the
    // wrong topic and can knock it out of the top-K retrieved chunks.
    expect(sickLeaveChunk).not.toContain('casual leave should not be denied')
  })
})
