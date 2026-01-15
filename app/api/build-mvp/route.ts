import { createClient, createAdminClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { BackboardClient } from "backboard-sdk";
import type { BuildJob, BuildStatus, Json } from "@/lib/database.types";

// Initialize Backboard client
const backboard = new BackboardClient({
  apiKey: process.env.BACKBOARD_API_KEY || "",
});

// System prompt for MVP generation
const MVP_SYSTEM_PROMPT = `You are an expert full-stack developer and product architect. Your role is to generate production-ready MVP code based on a structured canvas specification.

CAPABILITIES:
- Generate React/Next.js components with TypeScript
- Create API routes and backend logic
- Implement database schemas and queries
- Write clean, idiomatic code with proper error handling

GUIDELINES:
1. Analyze the canvas blocks and their connections
2. Understand the relationships and data flow
3. Generate modular, maintainable code
4. Include inline comments explaining key decisions
5. Use modern best practices (TypeScript, React hooks, etc.)

OUTPUT FORMAT:
Return a JSON object with:
{
  "files": [
    {
      "path": "relative/path/to/file.tsx",
      "content": "file content here",
      "language": "typescript"
    }
  ],
  "summary": "Brief description of what was generated",
  "notes": ["Important implementation notes"]
}`;

// Build tools for code generation
const BUILD_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "generate_file",
      description: "Generate a code file for the MVP",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path relative to project root" },
          content: { type: "string", description: "File content" },
          language: { type: "string", description: "Programming language" },
        },
        required: ["path", "content", "language"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "analyze_requirement",
      description: "Analyze a specific requirement from the canvas",
      parameters: {
        type: "object",
        properties: {
          block_id: { type: "string", description: "ID of the block being analyzed" },
          analysis: { type: "string", description: "Technical analysis of the requirement" },
          dependencies: { type: "array", items: { type: "string" }, description: "IDs of dependent blocks" },
        },
        required: ["block_id", "analysis"],
      },
    },
  },
];

type BuildRequest = {
  canvas_id: string;
  config?: {
    model?: string;
    provider?: string;
    options?: Record<string, unknown>;
  };
};

// POST /api/build-mvp - Queue a new MVP build job
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json() as BuildRequest;
    const { canvas_id, config = {} } = body;

    if (!canvas_id) {
      return NextResponse.json({ error: "Missing canvas_id" }, { status: 400 });
    }

    // Use admin client to bypass RLS for canvas lookup
    // (RLS only allows owner, but we check collaborators manually)
    const adminSupabase = createAdminClient();

    // Load the canvas (using admin to bypass RLS)
    const { data: canvas, error: canvasError } = await adminSupabase
      .from("builder_canvases")
      .select("*")
      .eq("id", canvas_id)
      .single();

    if (canvasError || !canvas) {
      return NextResponse.json({ error: "Canvas not found" }, { status: 404 });
    }

    // Verify user has access
    if (canvas.user_id !== user.id && !canvas.collaborators?.includes(user.id)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    // Create canvas snapshot
    const canvasSnapshot = {
      nodes: canvas.nodes as Json,
      edges: canvas.edges as Json,
      settings: canvas.settings as Json,
      name: canvas.name,
    };

    // Create build job
    const { data: buildJob, error: buildError } = await supabase
      .from("build_jobs")
      .insert({
        canvas_id,
        user_id: user.id,
        status: "queued" as BuildStatus,
        progress: 0,
        canvas_snapshot: canvasSnapshot as Json,
        config: config as Json,
        logs: [
          {
            timestamp: new Date().toISOString(),
            level: "info",
            message: "Build job created and queued",
          },
        ] as Json,
      })
      .select()
      .single();

    if (buildError) {
      console.error("Error creating build job:", buildError);
      return NextResponse.json({ error: buildError.message }, { status: 500 });
    }

    // Start the build process asynchronously
    // In production, this would be a background job queue
    startBuildProcess(buildJob.id, canvasSnapshot as { nodes: unknown[]; edges: unknown[]; settings: unknown; name: string }, config, supabase);

    return NextResponse.json({
      job_id: buildJob.id,
      status: "queued",
      message: "Build job queued successfully",
    });
  } catch (error) {
    console.error("Error in POST /api/build-mvp:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET /api/build-mvp?job_id=xxx - Get build job status
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const jobId = request.nextUrl.searchParams.get("job_id");
    const canvasId = request.nextUrl.searchParams.get("canvas_id");

    if (jobId) {
      // Get specific job
      const { data: job, error } = await supabase
        .from("build_jobs")
        .select("*")
        .eq("id", jobId)
        .single();

      if (error || !job) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
      }

      return NextResponse.json(job);
    } else if (canvasId) {
      // Get all jobs for a canvas
      const { data: jobs, error } = await supabase
        .from("build_jobs")
        .select("*")
        .eq("canvas_id", canvasId)
        .order("created_at", { ascending: false });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json(jobs || []);
    } else {
      // Get user's recent jobs
      const { data: jobs, error } = await supabase
        .from("build_jobs")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json(jobs || []);
    }
  } catch (error) {
    console.error("Error in GET /api/build-mvp:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Background build process using Backboard.io
async function startBuildProcess(
  jobId: string,
  canvasSnapshot: { nodes: unknown[]; edges: unknown[]; settings: unknown; name: string },
  config: Record<string, unknown>,
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateJob = async (updates: Record<string, any>) => {
    await supabase
      .from("build_jobs")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(updates as any)
      .eq("id", jobId);
  };

  const addLog = async (level: "info" | "warn" | "error", message: string) => {
    const { data: job } = await supabase
      .from("build_jobs")
      .select("logs")
      .eq("id", jobId)
      .single();

    const existingLogs = Array.isArray(job?.logs) ? job.logs : [];
    const logs = [...existingLogs, { timestamp: new Date().toISOString(), level, message }];
    await supabase
      .from("build_jobs")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ logs } as any)
      .eq("id", jobId);
  };

  try {
    // Update status to analyzing
    await updateJob({
      status: "analyzing" as BuildStatus,
      progress: 10,
      started_at: new Date().toISOString(),
    });
    await addLog("info", "Starting canvas analysis with Backboard.io");

    // Format canvas data for the prompt
    const nodes = canvasSnapshot.nodes as Array<{ id: string; data: { type: string; title: string; description: string } }>;
    const edges = canvasSnapshot.edges as Array<{ source: string; target: string }>;

    const canvasDescription = `
MVP Name: ${canvasSnapshot.name}

BLOCKS (${nodes.length} total):
${nodes.map((n) => `- [${n.data.type.toUpperCase()}] ${n.data.title}: ${n.data.description || "(no description)"}`).join("\n")}

CONNECTIONS (${edges.length} total):
${edges.map((e) => {
  const source = nodes.find((n) => n.id === e.source);
  const target = nodes.find((n) => n.id === e.target);
  return `- ${source?.data.title || e.source} → ${target?.data.title || e.target}`;
}).join("\n")}
`;

    // Create Backboard assistant for this build (without tools to avoid API issues)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let assistant: any;
    try {
      assistant = await backboard.createAssistant({
        name: `MVP Builder: ${canvasSnapshot.name}`,
        system_prompt: MVP_SYSTEM_PROMPT,
      });
    } catch (assistantError) {
      console.error("Failed to create assistant:", assistantError);
      throw new Error(`Failed to create Backboard assistant: ${assistantError instanceof Error ? assistantError.message : JSON.stringify(assistantError)}`);
    }

    // SDK returns camelCase: assistantId (docs confirm this)
    const assistantId = assistant.assistantId || assistant.assistant_id;
    
    await updateJob({
      backboard_assistant_id: assistantId,
      progress: 20,
    });
    await addLog("info", `Created Backboard assistant: ${assistantId}`);

    // Create thread for the build conversation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let thread: any;
    try {
      thread = await backboard.createThread(assistantId);
    } catch (threadError) {
      console.error("Failed to create thread:", threadError);
      throw new Error(`Failed to create Backboard thread: ${threadError instanceof Error ? threadError.message : JSON.stringify(threadError)}`);
    }

    // SDK returns camelCase: threadId (docs confirm this)
    const threadId = thread.threadId || thread.thread_id;

    await updateJob({
      backboard_thread_id: threadId,
      status: "building" as BuildStatus,
      progress: 30,
    });
    await addLog("info", `Created Backboard thread: ${threadId}`);

    // Send the canvas specification to Backboard
    const buildPrompt = `Generate a complete MVP based on this canvas specification:

${canvasDescription}

Please analyze the requirements and generate all necessary files for a working Next.js/React MVP.
Include:
1. Page components for each Page block
2. Feature implementations for each Feature block
3. API routes for each API/Backend block
4. Type definitions and utilities
5. Any necessary configuration files

Return the result as a JSON object with a "files" array containing all generated files.`;

    await addLog("info", "Sending build request to Backboard.io");
    await updateJob({ progress: 40 });

    // Get response from Backboard (non-streaming for reliability)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response: any = await backboard.addMessage(threadId, {
      content: buildPrompt,
      llm_provider: "openai",
      model_name: "gpt-4o",
      stream: false,
      memory: "Auto", // Enable memory for context
    });

    await updateJob({ progress: 70 });
    await addLog("info", "Received response from Backboard.io");

    // Handle tool calls if needed (SDK uses camelCase: toolCalls, runId)
    const toolCalls = response.toolCalls || response.tool_calls;
    const runId = response.runId || response.run_id;
    
    if (response.status === "REQUIRES_ACTION" && toolCalls) {
      await addLog("info", "Processing tool calls");

      const toolOutputs = [];
      for (const tc of toolCalls) {
        const args = tc.function.parsedArguments || tc.function.parsed_arguments;
        if (tc.function.name === "generate_file") {
          toolOutputs.push({
            tool_call_id: tc.id,
            output: JSON.stringify({ success: true, path: args.path }),
          });
        } else if (tc.function.name === "analyze_requirement") {
          toolOutputs.push({
            tool_call_id: tc.id,
            output: JSON.stringify({ analyzed: true, block_id: args.block_id }),
          });
        }
      }

      // Submit tool outputs
      const finalResponse = await backboard.submitToolOutputs(
        threadId,
        runId,
        toolOutputs
      );

      response.content = finalResponse.content;
    }

    await updateJob({ progress: 85 });

    // Parse the generated files
    let artifacts: { files: Array<{ path: string; content: string; language: string }>; summary?: string; notes?: string[] } = { files: [] };

    try {
      // Try to parse as JSON
      const jsonMatch = response.content.match(/```json\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        artifacts = JSON.parse(jsonMatch[1]);
      } else if (response.content.startsWith("{")) {
        artifacts = JSON.parse(response.content);
      } else {
        // Fallback: treat the whole response as a single file description
        artifacts = {
          files: [{
            path: "generated/README.md",
            content: response.content,
            language: "markdown",
          }],
          summary: "Build output (see README for details)",
        };
      }
    } catch (parseError) {
      await addLog("warn", "Could not parse structured output, storing as raw response");
      artifacts = {
        files: [{
          path: "generated/output.md",
          content: response.content,
          language: "markdown",
        }],
        summary: "Raw build output",
      };
    }

    // Update job with success
    await updateJob({
      status: "complete" as BuildStatus,
      progress: 100,
      artifacts,
      completed_at: new Date().toISOString(),
    });
    await addLog("info", `Build complete! Generated ${artifacts.files?.length || 0} files`);

  } catch (error) {
    console.error("Build process error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    await updateJob({
      status: "failed" as BuildStatus,
      error_message: errorMessage,
      error_details: error instanceof Error ? { stack: error.stack } : null,
      completed_at: new Date().toISOString(),
    });
    await addLog("error", `Build failed: ${errorMessage}`);
  }
}
