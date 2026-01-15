import { GoogleGenAI } from "@google/genai";

type WhiteboardAnalysisResponse = {
  detectedBlocks: {
    text: string;
    type: "page" | "feature" | "api" | "tool" | "design" | "custom";
    position: { x: number; y: number };
    confidence: number;
  }[];
  detectedConnections: {
    from: number;
    to: number;
    label?: string;
  }[];
  rawText: string[];
};

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const VISION_PROMPT = `You are analyzing a whiteboard photo for an MVP planning tool.

Look at this whiteboard image and extract:
1. Boxes, rectangles, or distinct text clusters that represent different components
2. Arrows or lines connecting these components
3. Any text labels

For each detected element, classify it as one of these types:
- "page": If it looks like a page, screen, or UI component (often labeled "home", "dashboard", etc.)
- "feature": If it describes functionality (verbs, actions, features)
- "api": If it mentions backend, API, database, server
- "tool": If it mentions external services, integrations, third-party tools
- "design": If it's about styling, colors, branding, UX notes
- "custom": If it doesn't fit the above categories

Return a JSON object with this exact structure:
{
  "detectedBlocks": [
    {
      "text": "the text content of the block",
      "type": "page|feature|api|tool|design|custom",
      "position": { "x": estimated_x_0_to_800, "y": estimated_y_0_to_600 },
      "confidence": 0.0_to_1.0
    }
  ],
  "detectedConnections": [
    {
      "from": index_of_source_block,
      "to": index_of_target_block,
      "label": "optional_connection_label"
    }
  ],
  "rawText": ["all", "text", "found", "in", "image"]
}

Position estimates should be normalized to a canvas of 800x600.
Be conservative - only include elements you're confident about.
Return ONLY valid JSON, no markdown or explanation.`;

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    // Convert file to base64
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const mimeType = file.type || "image/jpeg";

    // Call Gemini Vision API
    const result = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64,
              },
            },
            {
              text: VISION_PROMPT,
            },
          ],
        },
      ],
    });

    const responseText = result.text ?? "{}";

    // Try to parse the JSON response
    let analysis: WhiteboardAnalysisResponse;
    try {
      // Clean up potential markdown formatting
      const cleanedText = responseText
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      analysis = JSON.parse(cleanedText);
    } catch {
      // If parsing fails, return a minimal structure
      console.error("Failed to parse vision response:", responseText);
      analysis = {
        detectedBlocks: [
          {
            text: "Detected content",
            type: "custom",
            position: { x: 200, y: 200 },
            confidence: 0.5,
          },
        ],
        detectedConnections: [],
        rawText: [responseText.slice(0, 200)],
      };
    }

    // Validate and normalize the response
    analysis.detectedBlocks = (analysis.detectedBlocks || []).map((block, index) => ({
      text: block.text || `Block ${index + 1}`,
      type: ["page", "feature", "api", "tool", "design", "custom"].includes(block.type)
        ? block.type
        : "custom",
      position: {
        x: Math.max(50, Math.min(750, block.position?.x ?? 100 + index * 150)),
        y: Math.max(50, Math.min(550, block.position?.y ?? 100 + Math.floor(index / 4) * 150)),
      },
      confidence: Math.max(0, Math.min(1, block.confidence ?? 0.7)),
    }));

    analysis.detectedConnections = (analysis.detectedConnections || []).filter(
      (conn) =>
        typeof conn.from === "number" &&
        typeof conn.to === "number" &&
        conn.from >= 0 &&
        conn.to >= 0 &&
        conn.from < analysis.detectedBlocks.length &&
        conn.to < analysis.detectedBlocks.length
    );

    analysis.rawText = analysis.rawText || [];

    return Response.json(analysis);
  } catch (error) {
    console.error("Whiteboard analysis error:", error);
    return Response.json(
      {
        error: "Failed to analyze whiteboard",
        detectedBlocks: [],
        detectedConnections: [],
        rawText: [],
      },
      { status: 500 }
    );
  }
}
