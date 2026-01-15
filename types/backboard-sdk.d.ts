// Type declarations for backboard-sdk
// Since the SDK is JavaScript-only, we provide our own types

declare module "backboard-sdk" {
  export interface BackboardClientOptions {
    apiKey: string;
    baseUrl?: string;
    timeout?: number;
  }

  export interface Assistant {
    assistant_id: string;
    name: string;
    description?: string;
    tools?: Tool[];
    created_at: string;
    updated_at: string;
  }

  export interface Thread {
    thread_id: string;
    assistant_id: string;
    created_at: string;
    updated_at: string;
  }

  export interface Tool {
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: {
        type: "object";
        properties: Record<string, { type: string; description?: string; items?: { type: string } }>;
        required?: string[];
      };
    };
  }

  export interface ToolCall {
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
      parsed_arguments: Record<string, unknown>;
    };
  }

  export interface MessageResponse {
    message_id: string;
    thread_id: string;
    run_id: string;
    role: "assistant";
    content: string;
    status: "completed" | "REQUIRES_ACTION" | "failed";
    tool_calls?: ToolCall[];
    memory_operation_id?: string;
    created_at: string;
  }

  export interface CreateAssistantOptions {
    name: string;
    description?: string;
    system_prompt?: string;
    tools?: Tool[];
    embedding_provider?: string;
    embedding_model_name?: string;
    embedding_dims?: number;
  }

  export interface AddMessageOptions {
    content: string;
    llm_provider?: string;
    model_name?: string;
    stream?: boolean;
    memory?: "Auto" | "Off" | "Readonly";
    files?: string[];
  }

  export interface ToolOutput {
    tool_call_id: string;
    output: string;
  }

  export interface SubmitToolOutputsOptions {
    thread_id: string;
    run_id: string;
    tool_outputs: ToolOutput[];
  }

  export class BackboardClient {
    constructor(options: BackboardClientOptions);

    createAssistant(options: CreateAssistantOptions): Promise<Assistant>;
    listAssistants(options?: { skip?: number; limit?: number }): Promise<Assistant[]>;
    getAssistant(assistantId: string): Promise<Assistant>;
    updateAssistant(assistantId: string, options: Partial<CreateAssistantOptions>): Promise<Assistant>;
    deleteAssistant(assistantId: string): Promise<void>;

    createThread(assistantId: string): Promise<Thread>;
    getThread(threadId: string): Promise<Thread>;
    listThreads(options?: { skip?: number; limit?: number }): Promise<Thread[]>;
    deleteThread(threadId: string): Promise<void>;

    addMessage(threadId: string, options: AddMessageOptions): Promise<MessageResponse>;
    submitToolOutputs(threadId: string, runId: string, toolOutputs: ToolOutput[]): Promise<MessageResponse>;

    // Streaming
    addMessageStreaming(threadId: string, options: AddMessageOptions): AsyncGenerator<{ type: string; content?: string; [key: string]: unknown }>;
  }

  export class BackboardAPIError extends Error {
    status?: number;
    response?: Response;
  }

  export class BackboardValidationError extends BackboardAPIError {}
  export class BackboardNotFoundError extends BackboardAPIError {}
  export class BackboardRateLimitError extends BackboardAPIError {}
  export class BackboardServerError extends BackboardAPIError {}
}
