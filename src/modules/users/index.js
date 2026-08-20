/**
 * Users Module — Manages users, roles, auth, and parent-student linking.
 *
 * Store functions: getSchoolUserIds, listUsers, countUsers, findAuthSnapshot,
 *   findUserById, findUserByIdWithAuth, findUserByEmail, findUserByEmailInSchool,
 *   findParentByNameInSchool, findTeacherByNameInSchool, createUser, updateRole,
 *   updateUser, getChildren, deleteUser, logRoleAudit, listRoleAudit
 * API routes: /api/users/*, /api/auth/*, /api/parent/link
 * Components: TeachersTab, StudentsTab, RolesTab, LoginUsersTab
 * Models: User, RoleAudit
 */
export * from "./store";
