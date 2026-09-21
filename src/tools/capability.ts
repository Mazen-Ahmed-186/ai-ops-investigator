import type { z } from "zod";

import type { ToolResult } from "./types.js";

export type ToolCapability<TInput> = {
  name: string;
  title: string;
  description: string;

  inputSchema: z.ZodType<TInput>;

  annotations: {
    readOnly: boolean;
    destructive: boolean;
    idempotent: boolean;
  };

  execute(input: TInput): ToolResult<unknown>;
};
