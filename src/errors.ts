export class CareerError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export const MCP_TRIAL_EXPIRED_MESSAGE =
  'Your 3-day free trial for Hidden Jobs MCP has ended. To continue using MCP, visit https://hiddenjobs.dev/dashboard/account?from=mcp to review the plans and activate Hidden Jobs Access. Paid access starts immediately; there is no additional free trial. Your saved CVs, documents and applications remain available to read and export.';
