import { GoogleGenAI } from "@google/genai";
import ollama from "ollama";

type BuilderBlock = {
  id: string;
  type: string;
  title: string;
  description: string;
};

type BuilderEdge = {
  source: string;
  target: string;
};

type AnalyzeRequest = {
  blocks: BuilderBlock[];
  edges: BuilderEdge[];
  useSmallModel?: boolean; // Use Gemma for cost control
};

type AnalyzeResponse = {
  isReady: boolean;
  score: number;
  missingItems: string[];
  suggestions: string[];
  blockAnalysis: {
    blockId: string;
    issues: string[];
    suggestions: string[];
  }[];
  shouldEscalate: boolean; // Whether to escalate to larger model
  clarifyingQuestions?: string[];
};

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const ANALYSIS_PROMPT = `You are an expert product architect analyzing an MVP planning canvas.

The user has created blocks representing their app idea. Analyze the following blocks and connections:

BLOCKS:
{blocks}

CONNECTIONS:
{edges}

Evaluate the canvas and return a JSON response with:
1. isReady: boolean - Is there enough information to start building?
2. score: 0-100 - How complete is the specification?
3. missingItems: string[] - Critical missing pieces
4. suggestions: string[] - Helpful suggestions to improve
5. blockAnalysis: array of { blockId, issues, suggestions } for blocks that need work
6. shouldEscalate: boolean - Should this be sent to a larger model for building?
7. clarifyingQuestions: string[] - Questions to ask the user if not ready

Consider:
- Does it have at least one page defined?
- Are features clearly described?
- Are API endpoints specified if needed?
- Are blocks connected logically?
- Is there enough detail to generate code?

Return ONLY valid JSON, no markdown or explanation.`;

export async function POST(req: Request) {
  const body = (await req.json()) as AnalyzeRequest;
  const { blocks, edges, useSmallModel = true } = body;

  if (!blocks || blocks.length === 0) {
    return Response.json({
      isReady: false,
      score: 0,
      missingItems: ["No blocks defined"],
      suggestions: ["Start by adding a Page block to define your app's main screen"],
      blockAnalysis: [],
      shouldEscalate: false,
      clarifyingQuestions: ["What is the main purpose of your app?"],
    });
  }

  // Format blocks for the prompt
  const blocksStr = blocks
    .map((b) => `- [${b.type.toUpperCase()}] "${b.title}": ${b.description || "(no description)"}`)
    .join("\n");

  const edgesStr =
    edges.length > 0
      ? edges.map((e) => `${e.source} -> ${e.target}`).join("\n")
      : "(no connections)";

  const prompt = ANALYSIS_PROMPT.replace("{blocks}", blocksStr).replace("{edges}", edgesStr);

  try {
    let responseText: string;

    if (useSmallModel) {
      // Use Ollama with a small model (Gemma) for cost control
      try {
        const response = await ollama.chat({
          model: "gemma3:270m", // Small, fast model
          messages: [{ role: "user", content: prompt }],
          format: "json",
        });
        responseText = response.message.content;
      } catch {
        // Fallback to Gemini if Ollama not available
        const result = await ai.models.generateContent({
          model: "gemini-2.0-flash-lite",
          contents: prompt,
        });
        responseText = result.text ?? "{}";
      }
    } else {
      // Use Gemini for more capable analysis
      const result = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt,
      });
      responseText = result.text ?? "{}";
    }

    // Parse the response
    const analysis = JSON.parse(responseText) as AnalyzeResponse;

    // Apply some heuristic fixes
    if (!analysis.score) {
      analysis.score = calculateHeuristicScore(blocks, edges);
    }
    if (analysis.score === undefined) {
      analysis.score = 0;
    }
    analysis.isReady = analysis.score >= 70 && analysis.missingItems.length === 0;
    analysis.shouldEscalate = analysis.isReady;

    return Response.json(analysis);
  } catch (error) {
    console.error("Analysis error:", error);

    // Return heuristic-based analysis as fallback
    const heuristicAnalysis = generateHeuristicAnalysis(blocks, edges);
    return Response.json(heuristicAnalysis);
  }
}

function calculateHeuristicScore(blocks: BuilderBlock[], edges: BuilderEdge[]): number {
  let score = 0;

  const hasPage = blocks.some((b) => b.type === "page");
  const hasFeature = blocks.some((b) => b.type === "feature");
  const hasApi = blocks.some((b) => b.type === "api");
  const hasConnections = edges.length > 0;
  const allHaveDescriptions = blocks.every((b) => b.description && b.description.length > 10);
  const allHaveTitles = blocks.every((b) => b.title && b.title.length > 2);

  if (hasPage) score += 25;
  if (hasFeature) score += 20;
  if (hasApi && blocks.length > 2) score += 10;
  if (hasConnections) score += 15;
  if (allHaveTitles) score += 15;
  if (allHaveDescriptions) score += 15;

  return Math.min(score, 100);
}

function generateHeuristicAnalysis(blocks: BuilderBlock[], edges: BuilderEdge[]): AnalyzeResponse {
  const score = calculateHeuristicScore(blocks, edges);
  const missingItems: string[] = [];
  const suggestions: string[] = [];
  const blockAnalysis: { blockId: string; issues: string[]; suggestions: string[] }[] = [];

  const hasPage = blocks.some((b) => b.type === "page");
  const hasFeature = blocks.some((b) => b.type === "feature");

  if (!hasPage) {
    missingItems.push("No page block defined");
    suggestions.push("Add at least one Page block to define your app's routes");
  }

  if (!hasFeature) {
    missingItems.push("No feature blocks defined");
    suggestions.push("Add Feature blocks to describe your app's functionality");
  }

  if (edges.length === 0 && blocks.length > 1) {
    missingItems.push("No connections between blocks");
    suggestions.push("Connect blocks to show relationships and data flow");
  }

  // Check individual blocks
  for (const block of blocks) {
    const issues: string[] = [];
    const blockSuggestions: string[] = [];

    if (!block.description || block.description.length < 10) {
      issues.push("Missing or short description");
      blockSuggestions.push("Add a detailed description to help the AI understand this block");
    }

    if (issues.length > 0) {
      blockAnalysis.push({ blockId: block.id, issues, suggestions: blockSuggestions });
    }
  }

  const clarifyingQuestions: string[] = [];
  if (!hasPage) {
    clarifyingQuestions.push("What is the main page or screen of your application?");
  }
  if (!hasFeature) {
    clarifyingQuestions.push("What are the core features you want to build?");
  }

  return {
    isReady: score >= 70 && missingItems.length === 0,
    score,
    missingItems,
    suggestions,
    blockAnalysis,
    shouldEscalate: score >= 70 && missingItems.length === 0,
    clarifyingQuestions: clarifyingQuestions.length > 0 ? clarifyingQuestions : undefined,
  };
}
