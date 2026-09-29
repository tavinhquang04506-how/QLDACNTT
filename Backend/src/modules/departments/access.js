const BUDGET_ROLES = ['CEO', 'HR_DIRECTOR'];

/** Yearly budget is financial data: only CEO and HR_DIRECTOR see it. */
function shapeDepartment(row, user) {
  if (BUDGET_ROLES.includes(user.roleCode)) return row;
  // eslint-disable-next-line no-unused-vars
  const { budget_yearly, ...rest } = row;
  return rest;
}

module.exports = { shapeDepartment };
