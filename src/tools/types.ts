export type ToolErrorCategory =
  | "VALIDATION"
  | "AUTHORIZATION"
  | "NOT_FOUND"
  | "BUSINESS_REJECTION"
  | "TRANSIENT_DEPENDENCY"
  | "RATE_LIMITED"
  | "OUTCOME_UNKNOWN"
  | "INTERNAL";

export type ToolError = {
  code: string;
  category: ToolErrorCategory;
  retryable: boolean;
  message: string;
};

export type ToolResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: ToolError;
    };
