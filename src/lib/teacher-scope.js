/**
 * Teacher dashboard live-scope enforcement — pure selection logic.
 *
 * The API revalidates a teacher's subject-specialist scope on EVERY request
 * (requireClassScope 403s a revoked arm or subject immediately), but the
 * dashboard's arm/subject selectors keep their old selection until the next
 * /api/auth/me. This helper computes the bounce: given the FRESH scope from
 * /me and the current selection, it returns the selection with any revoked
 * value replaced by the first valid one.
 *
 * Validity mirrors the dashboard's existing fallbacks (and the API's):
 *   - arms:      assignedClasses, else the legacy [assignedClass], else the
 *                school's arms (an unassigned teacher may grade any arm)
 *   - subjects:  the teacher's explicit subjects, else the full subject list
 *                (a legacy generalist without assignments stays unrestricted)
 *
 * When there is NO valid value (an unassigned teacher in an arm-less school)
 * the current selection passes through untouched — there is nothing to bounce
 * to, and the API keeps denying until the admin assigns a scope.
 */
export function bounceTeacherSelection({
  currentArm,
  currentSubject,
  assignedClasses = [],
  assignedClass = "",
  subjects = [],
  schoolArms = [],
  allSubjects = [],
}) {
  const validArms =
    assignedClasses.length > 0
      ? assignedClasses
      : assignedClass
        ? [assignedClass]
        : schoolArms;
  const validSubjects = subjects.length > 0 ? subjects : allSubjects;

  return {
    classArm: validArms.length > 0 && !validArms.includes(currentArm) ? validArms[0] : currentArm,
    subject:
      validSubjects.length > 0 && !validSubjects.includes(currentSubject)
        ? validSubjects[0]
        : currentSubject,
  };
}
